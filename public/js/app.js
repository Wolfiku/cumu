/**
 * public/js/app.js
 * Cumu SPA Main Application.
 *
 * Features:
 *   - Dual-Audio Web Audio Engine with Gapless Playback & Crossfade (0-12s)
 *   - Dynamic Play Queue ("Als Nächstes spielen", "Ans Ende anfügen")
 *   - Drag & Drop Queue Reordering Overlay Panel
 *   - Playlist Management & Reordering
 *   - Redesigned User Settings Page Integration
 *   - Real-time WebSocket cross-device sync
 *   - OAuth2 Bearer Authentication
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

function stripHtml(html) {
  if (!html) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  const decoded = txt.value;
  const doc = new DOMParser().parseFromString(decoded, 'text/html');
  return doc.body.textContent || "";
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
    toast.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:var(--color-surface-dark,#222);color:var(--color-on-dark,#fff);padding:10px 20px;border-radius:20px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:all 0.2s ease';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 200);
  }, 2800);
}

(function () {
  // ── Application & Audio State ───────────────────────────────────────────────
  let currentUser       = null;
  let currentPage       = 'home';
  let queue             = [];
  let queueIndex        = 0;
  let isSpokenWord      = false;
  let isQueueOpen       = true;
  let currentSong       = null;
  let isPlaying         = false;
  let playlists         = [];
  let currentTheme      = 'coddy';
  let serverVersion     = 0;
  let isShuffle         = false;
  let repeatMode        = 'none'; // 'none' | 'all' | 'one'
  let isMuted           = false;
  let savedVolume       = 1.0;
  let favorites         = new Set(JSON.parse(localStorage.getItem('cumu_favorites') || '[]'));

  // ── Pinned Items Management ──────────────────────────────────────────────────
  let rightSidebarTab = 'pinned'; // 'pinned' | 'queue'

  const PIN_KEYS = {
    PODCASTS: 'special:podcasts',
    FAVORITES: 'special:favorites',
    playlist: (id) => `playlist:${id}`
  };

  function getPinnedKeys() {
    const raw = localStorage.getItem('cumu_pinned_items');
    if (raw === null) {
      return [PIN_KEYS.PODCASTS, PIN_KEYS.FAVORITES];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [PIN_KEYS.PODCASTS, PIN_KEYS.FAVORITES];
    } catch (_) {
      return [PIN_KEYS.PODCASTS, PIN_KEYS.FAVORITES];
    }
  }

  function isPinned(key) {
    return getPinnedKeys().includes(key);
  }

  function getPinnedCardsData() {
    const pinnedKeys = getPinnedKeys();
    const cards = [];
    for (const key of pinnedKeys) {
      if (key === PIN_KEYS.PODCASTS) {
        if (currentUser?.enablePodcasts !== false) {
          cards.push({
            key,
            title: 'Podcasts',
            subtitle: 'Shows & Episoden',
            typeLabel: 'Podcast',
            icon: 'podcasts',
            onClick: "navigate('podcasts')",
            bgClass: 'bg-primary-fixed/30 text-primary',
            iconColor: 'text-primary'
          });
        }
      } else if (key === PIN_KEYS.FAVORITES) {
        cards.push({
          key,
          title: 'Lieblingslieder',
          subtitle: `${favorites.size} Titel`,
          typeLabel: 'Kategorie',
          icon: 'favorite',
          onClick: "navigate('favorites')",
          bgClass: 'bg-error-container/30 text-error',
          iconColor: 'text-error'
        });
      } else if (key.startsWith('playlist:')) {
        const plId = key.replace('playlist:', '');
        const pl = playlists.find(p => p.id === plId);
        if (pl) {
          cards.push({
            key,
            title: pl.name,
            subtitle: pl.description || 'Playlist',
            typeLabel: 'Playlist',
            icon: 'queue_music',
            cover: pl.cover || null,
            onClick: `navigate('playlist','${pl.id}')`,
            bgClass: 'bg-surface-container-low text-primary',
            iconColor: 'text-primary'
          });
        }
      }
    }
    return cards;
  }

  function setRightSidebarTab(tab) {
    rightSidebarTab = tab;
    updateQueueUI();
  }

  function updateLeftNavPinned() {
    const container = document.getElementById('leftNavPinnedContainer');
    if (!container) return;
    const cards = getPinnedCardsData();
    if (!cards.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="px-sm mb-xs flex items-center justify-between text-[11px] font-bold text-text-muted uppercase tracking-wider">
        <span class="flex items-center gap-xs">
          <span class="material-symbols-outlined text-primary text-[14px]" style="font-variation-settings: 'FILL' 1;">push_pin</span>
          Angepinnt
        </span>
        <span class="font-mono text-xs">(${cards.length})</span>
      </div>
      <div class="flex flex-col gap-xs overflow-y-auto max-h-[220px]">
        ${cards.map(item => `
          <a href="#" onclick="${item.onClick}; return false;" class="group flex items-center justify-between px-md py-xs rounded-lg text-text-muted hover:text-text-high-contrast hover:bg-surface-bright transition-colors text-body-sm">
            <div class="flex items-center gap-sm min-w-0">
              <span class="material-symbols-outlined text-[18px] ${item.iconColor}">${item.icon}</span>
              <span class="truncate font-medium text-xs">${esc(item.title)}</span>
            </div>
            <button class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 p-xs transition-opacity" onclick="CumuApp.togglePin('${item.key}', event)" title="Abpinnen">
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">push_pin</span>
            </button>
          </a>
        `).join('')}
      </div>
    `;
  }

  function togglePin(key, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    let keys = getPinnedKeys();
    if (keys.includes(key)) {
      keys = keys.filter(k => k !== key);
    } else {
      keys.push(key);
      rightSidebarTab = 'pinned';
    }
    localStorage.setItem('cumu_pinned_items', JSON.stringify(keys));
    syncPush();

    if (window.innerWidth >= 1280 && !isQueueOpen) {
      isQueueOpen = true;
    }

    updateQueueUI();
    updateLeftNavPinned();

    if (currentPage === 'library')       renderLibrary();
    else if (currentPage === 'playlists') renderPlaylists();
    else if (currentPage === 'favorites') renderFavorites();
    else if (currentPage === 'podcasts')  renderPodcasts();
    else if (currentPage === 'playlist' && window._lastNavParams) renderPlaylist(window._lastNavParams);
  }

  // ── Dual Audio Web Audio Engine ─────────────────────────────────────────────
  let audioA            = new Audio();
  let audioB            = new Audio();
  let audioPodcast      = new Audio();
  let activeAudio       = audioA;
  let standbyAudio      = audioB;
  let audioCtx          = null;
  let gainNodeA         = null;
  let gainNodeB         = null;

  // Preferences
  let crossfadeDuration = 0;    // 0 = disabled, 1..12 seconds
  let gaplessEnabled    = true; // seamless preloading
  let isFading          = false;
  let preloadedNextId   = null;

  // ── DOM References ─────────────────────────────────────────────────────────
  const main            = document.getElementById('mainContent');
  const loginModal      = document.getElementById('loginModal');
  const npBar           = document.getElementById('nowPlayingBar');
  if (npBar) {
    npBar.addEventListener('click', (e) => {
      // Navigate to now playing unless a specific control button was clicked
      if (!e.target.closest('span[data-icon]') && !e.target.closest('button')) {
        navigate('nowplaying');
      }
    });
  }
  const npInfo          = document.getElementById('npInfo');
  const npControls      = document.getElementById('npControls');
  const npSeek          = null; // No seekbar in bottom player
  const npCurrent       = null;
  const npDuration      = null;
  const topNav          = null;
  const bottomNav       = null;
  const settingsBtn     = null;
  const adminBtn        = document.getElementById('navItem-admin');

  function showNpBar() {
    if (currentPage === 'nowplaying') {
      hideNpBar();
      return;
    }
    if (npBar && currentSong) npBar.style.display = 'flex';
  }
  function hideNpBar() {
    if (npBar) npBar.style.display = 'none';
  }

  // ── Web Audio API Engine Initialization ─────────────────────────────────────

  function initWebAudio() {
    if (audioCtx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();

      const sourceA = audioCtx.createMediaElementSource(audioA);
      gainNodeA = audioCtx.createGain();
      sourceA.connect(gainNodeA);
      gainNodeA.connect(audioCtx.destination);

      const sourceB = audioCtx.createMediaElementSource(audioB);
      gainNodeB = audioCtx.createGain();
      sourceB.connect(gainNodeB);
      gainNodeB.connect(audioCtx.destination);

      gainNodeA.gain.value = 1;
      gainNodeB.gain.value = 0;
    } catch (e) {
      console.warn('[cumu] Web Audio API init fallback:', e);
    }
  }

  function getActiveGain() {
    if (!audioCtx) return null;
    if (activeAudio === audioPodcast) return null;
    return activeAudio === audioA ? gainNodeA : gainNodeB;
  }

  function getStandbyGain() {
    if (!audioCtx) return null;
    if (activeAudio === audioPodcast) return null;
    return activeAudio === audioA ? gainNodeB : gainNodeA;
  }

  // ── Theme Switching ────────────────────────────────────────────────────────

  function applyTheme(theme) {
    if (!theme) theme = 'klassik';
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

    window.addEventListener('cumu:unauthorized', () => showLogin());

    // Unlock WebAudio Context on first click/touch
    const unlockAudio = () => {
      initWebAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

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

    setupGlobalDragAndDrop();

    if (loader) loader.style.display = 'none';
  }

  function showLogin() {
    if (loginModal) loginModal.classList.remove('hidden');
    hideNpBar();
  }

  function hideLogin() {
    if (loginModal) loginModal.classList.add('hidden');
  }

  window.updateNavigation = function() {
    if (currentUser?.enablePodcasts === false) {
      document.getElementById('navItem-podcasts')?.classList.add('hidden');
    } else {
      document.getElementById('navItem-podcasts')?.classList.remove('hidden');
    }
  };

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
    updateNavigation();

    CumuApi.connectWs();
    CumuApi.onWsMessage(handleWsMessage);

    await syncRestore();
    loadPlaylists();
    navigate('discover');
  }

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await CumuApi.login(username, password);
      currentUser = { username: res.username, role: res.role, theme: res.theme, enablePodcasts: res.enablePodcasts };
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
        if (state.theme && state.theme !== currentTheme) applyTheme(state.theme);
        if (state.volume !== undefined) {
          activeAudio.volume = state.volume;
          standbyAudio.volume = state.volume;
        }
        if (state.extraSettings) {
          if (state.extraSettings.crossfadeDuration !== undefined) crossfadeDuration = state.extraSettings.crossfadeDuration;
          if (state.extraSettings.gaplessEnabled !== undefined) gaplessEnabled = state.extraSettings.gaplessEnabled;
          if (Array.isArray(state.extraSettings.pinnedItems)) {
            localStorage.setItem('cumu_pinned_items', JSON.stringify(state.extraSettings.pinnedItems));
          }
        }
      }
    } catch (_) {}
  }

  async function syncPush(updates = {}) {
    try {
      const res = await CumuApi.post('/api/sync', {
        volume: activeAudio.volume,
        lastSongId: currentSong ? currentSong.id : null,
        lastPosition: activeAudio.currentTime || 0,
        theme: currentTheme,
        clientVersion: serverVersion,
        extraSettings: { crossfadeDuration, gaplessEnabled, pinnedItems: getPinnedKeys() },
        ...updates,
      });

      if (res.conflict) {
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
      if (s.theme && s.theme !== currentTheme) applyTheme(s.theme);
      if (s.volume !== undefined && Math.abs(activeAudio.volume - s.volume) > 0.05) {
        activeAudio.volume = s.volume;
        standbyAudio.volume = s.volume;
      }
      if (s.extraSettings) {
        if (s.extraSettings.crossfadeDuration !== undefined) crossfadeDuration = s.extraSettings.crossfadeDuration;
        if (s.extraSettings.gaplessEnabled !== undefined) gaplessEnabled = s.extraSettings.gaplessEnabled;
      }
    }
  }

  // ── Navigation Router ──────────────────────────────────────────────────────

  window.navigate = function (page, params) {
    currentPage = page;
    window._lastNavParams = params;

    // Desktop Nav highlighting
    document.querySelectorAll('#desktopNav a').forEach(item => {
      const isTarget = item.id === `navItem-${page}`;
      item.classList.toggle('bg-surface-container-low', isTarget);
      item.classList.toggle('text-text-high-contrast', isTarget);
      item.classList.toggle('font-bold', isTarget);
      item.classList.toggle('text-text-muted', !isTarget);
    });

    // Mobile Bottom Nav highlighting removed (no longer exists)

    if (currentUser && ['admin', 'creator'].includes(currentUser.role)) {
      const adminItem = document.getElementById('navItem-admin');
      if (adminItem) adminItem.classList.remove('hidden');
    }

    if (npBar) { if (!currentSong || page === 'nowplaying') hideNpBar(); else showNpBar(); }

    if      (page === 'discover')   renderDiscover();
    else if (page === 'library')    renderLibrary();
    else if (page === 'playlists')  renderPlaylists();
    else if (page === 'favorites')  renderFavorites();
    else if (page === 'podcasts') {
      if (currentUser?.enablePodcasts === false) { navigate('discover'); return; }
      renderPodcasts();
    }
    else if (page === 'genre')      renderGenre(params);
    else if (page === 'admin')      renderAdmin();
    else if (page === 'album')      renderAlbum(params);
    else if (page === 'artist')     renderArtist(params);
    else if (page === 'playlist')   renderPlaylist(params);
    else if (page === 'song')       renderSong(params);
    else if (page === 'nowplaying') renderNowPlaying();
    else if (page === 'settings')   renderSettings();

    window.scrollTo(0, 0);
  };

  // ── Advanced Audio Engine (Crossfade & Gapless) ─────────────────────────────

  async function playSong(song, isAudiobook = false, startPosition = 0) {
    if (!song || !song.id) { showToast('Song-Daten fehlen'); return; }
    initWebAudio();

    currentSong = song;
    isSpokenWord = isAudiobook || !!song.is_audiobook || !!song.isPodcast;
    isFading = false;
    preloadedNextId = null;

    if (song.isPodcast) {
      audioA.pause();
      audioB.pause();
      activeAudio = audioPodcast;
    } else if (activeAudio === audioPodcast) {
      audioPodcast.pause();
      activeAudio = audioA;
      standbyAudio = audioB;
    }

    if (!queue.length) {
      queue = [song];
      queueIndex = 0;
    } else if (queue[queueIndex]?.id !== song.id) {
      const idx = queue.findIndex(s => s.id === song.id);
      if (idx !== -1) {
        queueIndex = idx;
      } else {
        queue.splice(queueIndex + 1, 0, song);
        queueIndex = queueIndex + 1;
      }
    }

    if (audioCtx) {
      const gAct = getActiveGain();
      const gStb = getStandbyGain();
      if (gAct) gAct.gain.value = 1;
      if (gStb) gStb.gain.value = 0;
    }

    standbyAudio.pause();
    standbyAudio.currentTime = 0;

    let audioSrc = song.audioUrl ? song.audioUrl : CumuApi.streamUrl(song.id);
    if (window.CumuOfflineStore) {
      try {
        const offlineSong = await CumuOfflineStore.getOfflineSong(song.id);
        if (offlineSong && offlineSong.audioBlob) {
          if (window._lastBlobUrl) URL.revokeObjectURL(window._lastBlobUrl);
          audioSrc = URL.createObjectURL(offlineSong.audioBlob);
          window._lastBlobUrl = audioSrc;
        }
      } catch (e) {
        console.warn('[cumu] offline blob retrieval error:', e);
      }
    }

    activeAudio.src = audioSrc;
    activeAudio.load();

    if (startPosition > 0) {
      const applyPos = () => {
        try { activeAudio.currentTime = startPosition; } catch (_) {}
      };
      if (activeAudio.readyState >= 1) {
        applyPos();
      } else {
        activeAudio.addEventListener('loadedmetadata', applyPos, { once: true });
      }
    }

    const playPromise = activeAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        isPlaying = true;
        if (startPosition > 0) {
          try { activeAudio.currentTime = startPosition; } catch (_) {}
        }
        updatePlayerUI();
        if (navigator.onLine) {
          CumuApi.post(`/api/songs/${song.id}/play`, {}).catch(() => {});
        }
      }).catch(err => {
        console.error('[cumu] playback error:', err);
        isPlaying = false;
        if (err.name === 'NotAllowedError') {
          showToast('Drücke Play, um die Wiedergabe zu starten');
        } else {
          showToast('Fehler bei der Wiedergabe (Netzwerk oder Dateiformat)');
        }
        updatePlayerUI();
      });
    }

    showNpBar();
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
    initWebAudio();
    if (isPlaying) {
      activeAudio.pause();
      if (isFading) standbyAudio.pause();
      isPlaying = false;
    } else {
      activeAudio.play();
      if (isFading) standbyAudio.play();
      isPlaying = true;
    }
    updatePlayerUI();
  }

  function stopAudio() {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    standbyAudio.pause();
    standbyAudio.currentTime = 0;
    isPlaying = false;
    currentSong = null;
    hideNpBar();
  }

  function nextTrack() {
    if (!queue.length) return;
    if (repeatMode === 'one' && currentSong) {
      playSong(currentSong, !!currentSong.isPodcast || !!currentSong.is_audiobook);
      return;
    }
    if (isShuffle && queue.length > 1) {
      let nextIdx = Math.floor(Math.random() * queue.length);
      if (nextIdx === queueIndex) nextIdx = (queueIndex + 1) % queue.length;
      queueIndex = nextIdx;
    } else {
      queueIndex = (queueIndex + 1) % queue.length;
    }
    playSong(queue[queueIndex]);
  }

  function prevTrack() {
    if (!queue.length) return;
    if (isShuffle && queue.length > 1) {
      let prevIdx = Math.floor(Math.random() * queue.length);
      if (prevIdx === queueIndex) prevIdx = (queueIndex - 1 + queue.length) % queue.length;
      queueIndex = prevIdx;
    } else {
      queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    }
    playSong(queue[queueIndex]);
  }

  function swapAudioElements() {
    const tempAudio = activeAudio;
    activeAudio = standbyAudio;
    standbyAudio = tempAudio;
  }

  let lastSavedPodcastProgressTime = 0;
  function savePodcastProgress(force = false) {
    if (!currentSong || !currentSong.isPodcast || !activeAudio) return;
    const curTime = activeAudio.currentTime || 0;
    const dur = activeAudio.duration || 0;
    if (curTime <= 0) return;

    const now = Date.now();
    if (!force && now - lastSavedPodcastProgressTime < 2000) return;
    lastSavedPodcastProgressTime = now;

    const progressData = {
      podcastId: currentSong.podcastId || currentSong.id,
      podcastTitle: currentSong.artist || currentSong.podcastTitle || 'Podcast',
      episodeTitle: currentSong.title || 'Episode',
      episodeId: currentSong.id,
      audioUrl: currentSong.audioUrl,
      cover: currentSong.cover || '',
      feedUrl: currentSong.feedUrl || '',
      currentTime: Math.floor(curTime),
      duration: Math.floor(dur),
      updatedAt: now
    };

    try {
      localStorage.setItem('cumu_podcast_progress', JSON.stringify(progressData));
    } catch (e) {
      console.warn('[cumu] localStorage podcast save error:', e);
    }

    if (force || now - (window._lastBackendPodcastSync || 0) > 8000) {
      window._lastBackendPodcastSync = now;
      CumuApi.post('/api/podcasts/progress', { progress: progressData }).catch(() => {});
    }
  }

  window.addEventListener('beforeunload', () => savePodcastProgress(true));
  window.addEventListener('pagehide', () => savePodcastProgress(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) savePodcastProgress(true);
  });

  window.resumePodcastEpisode = (progressData) => {
    if (!progressData) return;
    const song = {
      id: progressData.episodeId,
      title: progressData.episodeTitle,
      artist: progressData.podcastTitle,
      podcastTitle: progressData.podcastTitle,
      podcastId: progressData.podcastId,
      cover: progressData.cover,
      audioUrl: progressData.audioUrl,
      feedUrl: progressData.feedUrl,
      isPodcast: true
    };
    playSong(song, true, progressData.currentTime || 0);
    navigate('nowplaying');
  };

  window.clearPodcastProgress = async () => {
    try {
      localStorage.removeItem('cumu_podcast_progress');
    } catch (_) {}
    try {
      await CumuApi.post('/api/podcasts/progress', { progress: null });
    } catch (_) {}
    showToast('Weiterhören zurückgesetzt');
    
    const contSec = document.getElementById('podcastContinueSection');
    if (contSec) contSec.classList.add('hidden');
    const npContSec = document.getElementById('nowPlayingContinueSection');
    if (npContSec) npContSec.classList.add('hidden');
  };

  function setupAudioListeners(audioEl, isPrimary) {
    audioEl.addEventListener('play', () => {
      if (audioEl === activeAudio) {
        isPlaying = true;
        updatePlayerUI();
      }
    });

    audioEl.addEventListener('pause', () => {
      if (audioEl === activeAudio && !isFading) {
        isPlaying = false;
        if (currentSong && currentSong.isPodcast) {
          savePodcastProgress(true);
        }
        updatePlayerUI();
      }
    });

    audioEl.addEventListener('ended', () => {
      if (audioEl === activeAudio) {
        if (repeatMode === 'one') {
          playSong(currentSong, !!currentSong.isPodcast || !!currentSong.is_audiobook);
        } else if (queue.length > 0 && (queueIndex + 1 < queue.length || repeatMode === 'all' || isShuffle)) {
          nextTrack();
        } else {
          isPlaying = false;
          updatePlayerUI();
        }
      }
    });

    audioEl.addEventListener('timeupdate', () => {
      if (audioEl !== activeAudio) return;
      if (!activeAudio.duration) return;

      if (currentSong && currentSong.isPodcast) {
        savePodcastProgress(false);
      }

      const cur = activeAudio.currentTime;
      const dur = activeAudio.duration;
      const rem = dur - cur;
      const pct = (cur / dur) * 100;

      if (npSeek) {
        npSeek.value = pct;
        npSeek.style.setProperty('--progress-percent', `${pct}%`);
        // drive the ::after fill on the track container
        const seekTrack = npSeek.closest('.np-seek-track');
        if (seekTrack) seekTrack.style.setProperty('--progress-percent', `${pct}%`);
      }
      if (npCurrent)  npCurrent.textContent = formatTime(cur);
      if (npDuration) npDuration.textContent = formatTime(dur);

      const fullSeek = document.getElementById('fullNpSeek');
      const fullCur  = document.getElementById('fullNpCurrent');
      const fullDur  = document.getElementById('fullNpDuration');
      if (fullSeek) {
        fullSeek.value = pct;
        fullSeek.style.setProperty('--progress-percent', `${pct}%`);
      }
      if (fullCur)  fullCur.textContent = formatTime(cur);
      if (fullDur)  fullDur.textContent = formatTime(dur);

      const podSeek = document.getElementById('podcastSeek');
      const podCur  = document.getElementById('podcastCurrentTime');
      const podDur  = document.getElementById('podcastDuration');
      if (podSeek) {
        podSeek.value = pct;
        podSeek.style.setProperty('--progress-percent', `${pct}%`);
      }
      if (podCur)  podCur.textContent = formatTime(cur);
      if (podDur)  podDur.textContent = formatTime(dur);

      const nextSong = queue[queueIndex + 1];
      if (nextSong && gaplessEnabled && rem < 6 && preloadedNextId !== nextSong.id) {
        preloadedNextId = nextSong.id;
        standbyAudio.src = nextSong.audioUrl ? nextSong.audioUrl : CumuApi.streamUrl(nextSong.id);
        standbyAudio.load();
      }

      if (crossfadeDuration > 0 && nextSong && rem <= crossfadeDuration && !isFading && cur > 1) {
        isFading = true;
        const now = audioCtx ? audioCtx.currentTime : 0;
        const fadeTime = Math.max(rem, 0.5);

        if (audioCtx) {
          const gAct = getActiveGain();
          const gStb = getStandbyGain();
          if (gAct) {
            gAct.gain.setValueAtTime(1, now);
            gAct.gain.linearRampToValueAtTime(0, now + fadeTime);
          }
          if (gStb) {
            gStb.gain.setValueAtTime(0, now);
            gStb.gain.linearRampToValueAtTime(1, now + fadeTime);
          }
        }

        standbyAudio.play().then(() => {
          setTimeout(() => {
            swapAudioElements();
            queueIndex++;
            currentSong = queue[queueIndex];
            isFading = false;
            preloadedNextId = null;
            updatePlayerUI();
          }, fadeTime * 1000);
        }).catch(err => console.warn('[cumu] crossfade play failed:', err));
      }
    });
  }

  setupAudioListeners(audioA, true);
  setupAudioListeners(audioB, false);
  setupAudioListeners(audioPodcast, false);

  if (npSeek) {
    npSeek.addEventListener('input', () => {
      if (activeAudio.duration) {
        activeAudio.currentTime = (npSeek.value / 100) * activeAudio.duration;
      }
    });
  }

  function toggleShuffle() {
    isShuffle = !isShuffle;
    showToast(isShuffle ? 'Zufallswiedergabe aktiviert' : 'Zufallswiedergabe deaktiviert');
    updatePlayerUI();
  }

  function toggleRepeat() {
    if (repeatMode === 'none') repeatMode = 'all';
    else if (repeatMode === 'all') repeatMode = 'one';
    else repeatMode = 'none';

    const modeLabels = { none: 'Wiederholung aus', all: 'Alle wiederholen', one: 'Titel wiederholen' };
    showToast(modeLabels[repeatMode]);
    updatePlayerUI();
  }

  function setVolume(val) {
    const v = Math.max(0, Math.min(1, parseFloat(val)));
    activeAudio.volume = v;
    standbyAudio.volume = v;
    audioPodcast.volume = v;
    if (v > 0) {
      isMuted = false;
      savedVolume = v;
    } else {
      isMuted = true;
    }
    updateVolumeUI();
  }

  function toggleMute() {
    if (isMuted) {
      isMuted = false;
      const restore = savedVolume || 0.8;
      activeAudio.volume = restore;
      standbyAudio.volume = restore;
      audioPodcast.volume = restore;
    } else {
      savedVolume = activeAudio.volume || 0.8;
      isMuted = true;
      activeAudio.volume = 0;
      standbyAudio.volume = 0;
      audioPodcast.volume = 0;
    }
    updateVolumeUI();
  }

  function updateVolumeUI() {
    const volPct = isMuted ? 0 : Math.round(activeAudio.volume * 100);
    const npVol = document.getElementById('npVolume');
    const fullVol = document.getElementById('fullNpVolume');
    if (npVol) {
      npVol.value = volPct;
      npVol.style.setProperty('--volume-percent', `${volPct}%`);
    }
    if (fullVol) {
      fullVol.value = volPct;
      fullVol.style.setProperty('--volume-percent', `${volPct}%`);
    }
  }

  function toggleFavorite(songId) {
    if (!songId) return;
    if (favorites.has(songId)) {
      favorites.delete(songId);
      showToast('Aus Favoriten entfernt');
    } else {
      favorites.add(songId);
      showToast('Zu Favoriten hinzugefügt');
    }
    localStorage.setItem('cumu_favorites', JSON.stringify(Array.from(favorites)));
    updatePlayerUI();
  }

  function updatePlayerUI() {
    if (!currentSong) return;
    showNpBar();
    window._currentSongId = currentSong.id;

    const coverSrc = currentSong.cover ? `/stream/cover/${currentSong.cover}` : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f3f3f4"/></svg>';
    const npCover = document.getElementById('npCover');
    if (npCover) npCover.src = coverSrc;

    const npTitle = document.getElementById('npTitle');
    if (npTitle) npTitle.textContent = currentSong.title || 'Ohne Titel';

    const npArtist = document.getElementById('npArtist');
    if (npArtist) npArtist.textContent = (currentSong.artist_name || 'Unbekannter Künstler').toLowerCase();

    const npPlayIcon = document.getElementById('npPlayIcon');
    if (npPlayIcon) npPlayIcon.textContent = isPlaying ? 'pause_circle' : 'play_circle';

    const podcastPlayIcon = document.getElementById('podcastPlayIcon');
    if (podcastPlayIcon) podcastPlayIcon.textContent = isPlaying ? 'pause' : 'play_arrow';

    const fullNpPlayIcon = document.getElementById('fullNpPlayIcon');
    if (fullNpPlayIcon) fullNpPlayIcon.textContent = isPlaying ? 'pause' : 'play_arrow';

    const npFavIcon = document.getElementById('npFavIcon');
    if (npFavIcon) {
      const isFav = favorites.has(currentSong.id);
      npFavIcon.textContent = isFav ? 'favorite' : 'favorite_border';
      npFavIcon.style.color = isFav ? '#ba1a1a' : '';
    }

    const npShuffleBtn = document.getElementById('npShuffleBtn');
    if (npShuffleBtn) {
      if (isShuffle) {
        npShuffleBtn.classList.add('text-text-high-contrast', 'font-bold');
        npShuffleBtn.classList.remove('text-text-muted');
      } else {
        npShuffleBtn.classList.remove('text-text-high-contrast', 'font-bold');
        npShuffleBtn.classList.add('text-text-muted');
      }
    }

    const npRepeatBtn = document.getElementById('npRepeatBtn');
    if (npRepeatBtn) {
      npRepeatBtn.textContent = repeatMode === 'one' ? 'repeat_one' : 'repeat';
      if (repeatMode !== 'none') {
        npRepeatBtn.classList.add('text-text-high-contrast', 'font-bold');
        npRepeatBtn.classList.remove('text-text-muted');
      } else {
        npRepeatBtn.classList.remove('text-text-high-contrast', 'font-bold');
        npRepeatBtn.classList.add('text-text-muted');
      }
    }

    if (currentPage === 'nowplaying') {
      renderNowPlaying();
    }
    updateQueueUI();
  }

  // ── Dynamic Play Queue Functions ───────────────────────────────────────────

  function ensureCurrentSongInQueue() {
    if (currentSong && (!queue.length || queueIndex < 0 || queueIndex >= queue.length)) {
      queue = [currentSong];
      queueIndex = 0;
    }
  }

  function playNext(song) {
    if (!song) return;
    if (currentSong) {
      ensureCurrentSongInQueue();
      queue.splice(queueIndex + 1, 0, song);
      showToast(`"${song.title}" wird als Nächstes gespielt`);
    } else {
      queue = [song];
      queueIndex = 0;
      playSong(song);
    }
  }

  async function playNextById(songId) {
    const song = await CumuApi.get(`/api/songs/${songId}`);
    playNext(song);
  }

  function addToQueue(song) {
    if (!song) return;
    if (currentSong) {
      ensureCurrentSongInQueue();
      queue.push(song);
      showToast(`"${song.title}" zur Warteschlange hinzugefügt`);
    } else {
      queue = [song];
      queueIndex = 0;
      playSong(song);
    }
    updateQueueUI();
  }

  async function addToQueueById(songId) {
    const song = await CumuApi.get(`/api/songs/${songId}`);
    addToQueue(song);
  }

  function playNextPlaylist(playlistSongs) {
    if (!playlistSongs || !playlistSongs.length) return;
    if (currentSong) {
      ensureCurrentSongInQueue();
      queue.splice(queueIndex + 1, 0, ...playlistSongs);
      showToast(`${playlistSongs.length} Songs als Nächstes hinzugefügt`);
    } else {
      queue = [...playlistSongs];
      queueIndex = 0;
      playSong(queue[0]);
    }
  }

  function addToQueuePlaylist(playlistSongs) {
    if (!playlistSongs || !playlistSongs.length) return;
    if (currentSong) {
      ensureCurrentSongInQueue();
      queue.push(...playlistSongs);
      showToast(`${playlistSongs.length} Songs zur Warteschlange hinzugefügt`);
    } else {
      queue = [...playlistSongs];
      queueIndex = 0;
      playSong(queue[0]);
    }
  }

  function removeFromQueue(index) {
    if (index === queueIndex) {
      showToast('Das aktuell gespielte Lied kann nicht entfernt werden');
      return;
    }
    const [removed] = queue.splice(index, 1);
    if (index < queueIndex) queueIndex--;
    showToast(`"${removed.title}" entfernt`);
    updateQueueUI();
  }

  function clearQueue() {
    if (currentSong) {
      queue = [currentSong];
      queueIndex = 0;
      showToast('Warteschlange geleert');
      updateQueueUI();
    } else {
      queue = [];
      queueIndex = 0;
      stopAudio();
      showToast('Warteschlange geleert');
      const panel = document.getElementById('cumuQueuePanel');
      if (panel) panel.remove();
      updateQueueUI();
    }
  }

  // ── Drag & Drop Right Side Queue Widget & Permanent Sidebar ────────────────

  function toggleQueue(forceState = null) {
    if (window.innerWidth < 1280) {
      const existing = document.getElementById('cumuQueuePanel');
      if (existing && forceState !== true) {
        existing.remove();
      } else {
        showQueuePanel(true);
      }
      return;
    }

    if (forceState !== null) {
      isQueueOpen = forceState;
    } else {
      isQueueOpen = !isQueueOpen;
    }

    applyQueueVisibility();
  }

  function applyQueueVisibility() {
    const desktopSidebar = document.getElementById('desktopQueueSidebar');
    const mainContent = document.getElementById('mainContent');
    const npContainer = document.querySelector('.np-container-overlay');

    if (desktopSidebar) {
      if (isQueueOpen && window.innerWidth >= 1280) {
        desktopSidebar.classList.remove('hidden');
        desktopSidebar.classList.add('xl:flex');
        if (mainContent) mainContent.classList.add('xl:mr-80');
        if (npContainer) {
          npContainer.classList.add('xl:right-80');
          npContainer.classList.remove('xl:right-0');
        }
      } else {
        desktopSidebar.classList.add('hidden');
        desktopSidebar.classList.remove('xl:flex');
        if (mainContent) mainContent.classList.remove('xl:mr-80');
        if (npContainer) {
          npContainer.classList.remove('xl:right-80');
          npContainer.classList.add('xl:right-0');
        }
      }
    }
  }

  function updateQueueUI() {
    applyQueueVisibility();
    const desktopSidebar = document.getElementById('desktopQueueSidebar');
    if (desktopSidebar && isQueueOpen) {
      renderQueueContent(desktopSidebar, false);
    }
    const mobileDrawer = document.querySelector('#cumuQueuePanel .queue-drawer-container');
    if (mobileDrawer) {
      renderQueueContent(mobileDrawer, true);
    }
  }

  function renderQueueContent(containerEl, isMobileModal = false) {
    if (!containerEl) return;

    const pinnedCards = getPinnedCardsData();

    // On Desktop Right Sidebar, support Tabbed switching (Angepinnt vs Queue)
    if (!isMobileModal) {
      const headerHTML = `
        <div class="flex items-center justify-between p-sm md:p-md border-b border-border-subtle bg-surface-container-lowest flex-shrink-0">
          <div class="flex items-center gap-xs">
            <button class="flex items-center gap-xs px-md py-xs rounded-lg text-body-sm font-bold transition-all ${rightSidebarTab === 'pinned' ? 'bg-surface-container-high text-text-high-contrast shadow-xs' : 'text-text-muted hover:text-text-high-contrast'}" onclick="CumuApp.setRightSidebarTab('pinned')">
              <span class="material-symbols-outlined text-[18px] text-primary" style="font-variation-settings: 'FILL' 1;">push_pin</span>
              Angepinnt (${pinnedCards.length})
            </button>
            <button class="flex items-center gap-xs px-md py-xs rounded-lg text-body-sm font-bold transition-all ${rightSidebarTab === 'queue' ? 'bg-surface-container-high text-text-high-contrast shadow-xs' : 'text-text-muted hover:text-text-high-contrast'}" onclick="CumuApp.setRightSidebarTab('queue')">
              <span class="material-symbols-outlined text-[18px]">queue_music</span>
              Queue (${queue.length})
            </button>
          </div>
          <button class="w-8 h-8 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast flex items-center justify-center transition-colors hover:scale-105 active:scale-95" onclick="CumuApp.toggleQueue()" title="Schließen">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>`;

      if (rightSidebarTab === 'pinned') {
        let pinnedHTML = '';
        if (!pinnedCards.length) {
          pinnedHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-text-muted gap-sm text-center px-md">
              <span class="material-symbols-outlined text-[48px] opacity-40">push_pin</span>
              <p class="text-body-md font-bold text-text-high-contrast">Keine angepinnten Elemente</p>
              <p class="text-body-sm">Klicke auf das Pin-Symbol bei einer Playlist, einem Podcast oder den Lieblingsliedern, um sie hier in der Sidebar zu verankern.</p>
            </div>`;
        } else {
          pinnedHTML = pinnedCards.map(item => `
            <div class="group flex items-center gap-md w-full p-xs rounded-xl hover:bg-surface-container-low border border-transparent hover:border-border-subtle cursor-pointer transition-all duration-200" onclick="${item.onClick}">
              <div class="w-12 h-12 rounded-lg overflow-hidden ${item.bgClass} flex-shrink-0 flex items-center justify-center border border-border-subtle relative">
                ${item.cover ? `<img src="${item.cover}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />` : `<span class="material-symbols-outlined text-[24px] ${item.iconColor}">${item.icon}</span>`}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-[1px]">${esc(item.typeLabel)}</div>
                <div class="font-bold text-body-md truncate text-text-high-contrast group-hover:text-primary transition-colors">
                  ${esc(item.title)}
                </div>
                <div class="text-body-sm text-text-muted truncate">
                  ${esc(item.subtitle)}
                </div>
              </div>
              <button class="w-8 h-8 rounded-full text-text-muted hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors flex-shrink-0 opacity-40 group-hover:opacity-100" onclick="CumuApp.togglePin('${item.key}', event)" title="Vom Dashboard abpinnen">
                <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">push_pin</span>
              </button>
            </div>
          `).join('');
        }

        containerEl.innerHTML = `
          ${headerHTML}
          <div class="flex-1 overflow-y-auto p-md space-y-xs">
            ${pinnedHTML}
          </div>`;
        return;
      }
    }

    // Queue rendering
    let listHTML = '';
    if (!queue.length) {
      listHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-text-muted gap-sm">
          <span class="material-symbols-outlined text-[48px] opacity-40">queue_music</span>
          <p class="text-body-md font-medium">Keine Tracks in der Warteschlange</p>
        </div>`;
    } else {
      queue.forEach((song, i) => {
        const isCurrent = (i === queueIndex);
        const coverSrc  = song.cover ? (song.cover.startsWith('http') ? song.cover : `/stream/cover/${song.cover}`) : null;
        
        if (i === 0 && queueIndex > 0) {
          listHTML += `<div class="text-[11px] font-bold uppercase tracking-wider text-text-muted px-xs pt-xs pb-1">Vergangene Titel</div>`;
        } else if (isCurrent) {
          listHTML += `<div class="text-[11px] font-bold uppercase tracking-wider text-primary px-xs pt-xs pb-1 flex items-center gap-xs"><span class="material-symbols-outlined text-[14px]">play_circle</span> Gerade läuft</div>`;
        } else if (i === queueIndex + 1) {
          listHTML += `<div class="text-[11px] font-bold uppercase tracking-wider text-text-muted px-xs pt-md pb-1">Nächste Titel in der Warteschlange</div>`;
        }

        listHTML += `
          <div
            class="queue-drag-item group flex items-center gap-md w-full p-xs rounded-xl transition-all duration-200 ${isCurrent ? 'bg-primary/10 border border-primary/30 shadow-sm active cursor-default' : 'hover:bg-surface-container-low border border-transparent cursor-grab'}"
            draggable="${isCurrent ? 'false' : 'true'}"
            data-index="${i}"
          >
            ${isCurrent
              ? `<span class="material-symbols-outlined text-primary text-[20px] select-none p-xs" title="Aktuell abgespielt">volume_up</span>`
              : `<span class="material-symbols-outlined text-text-muted text-[20px] cursor-grab select-none opacity-40 group-hover:opacity-100" title="Ziehen zum Sortieren">drag_indicator</span>`
            }

            <div class="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-low flex-shrink-0 relative">
              ${coverSrc
                ? `<img src="${coverSrc}" class="w-full h-full object-cover" alt="cover">`
                : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[24px]">music_note</span></div>`
              }
            </div>

            <div class="flex-1 min-w-0 cursor-pointer" onclick="CumuApp.jumpToQueueIndex(${i})">
              <div class="font-bold text-body-md truncate ${isCurrent ? 'text-primary' : 'text-text-high-contrast'}">
                ${esc(song.title)}
              </div>
              <div class="text-body-sm text-text-muted truncate">
                ${esc(song.artist_name || song.artist || 'Unbekannter Künstler')}
              </div>
            </div>

            ${!isCurrent ? `
              <button class="w-8 h-8 rounded-full text-text-muted hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors flex-shrink-0" onclick="CumuApp.removeFromQueue(${i})" title="Entfernen">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            ` : `<div class="w-8 h-8 flex-shrink-0"></div>`}
          </div>`;
      });
    }

    const headerHTML = isMobileModal ? `
      <div class="flex items-center justify-between p-md md:p-lg border-b border-border-subtle bg-surface-container-lowest flex-shrink-0">
        <div class="flex items-center gap-xs">
          <span class="material-symbols-outlined text-primary text-[24px]">queue_music</span>
          <h2 class="text-title-md font-bold text-text-high-contrast">Warteschlange</h2>
          <span class="text-body-sm text-text-muted font-mono">(${queue.length})</span>
        </div>
        <div class="flex items-center gap-xs">
          ${queue.length > 1 ? `<button class="text-body-sm font-bold text-text-muted hover:text-red-500 px-sm py-xs rounded-lg hover:bg-surface-container-low transition-colors" onclick="CumuApp.clearQueue()">Leeren</button>` : ''}
          <button class="w-9 h-9 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast flex items-center justify-center transition-colors hover:scale-105 active:scale-95" onclick="CumuApp.toggleQueue()" title="Schließen">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>` : `
      <div class="flex items-center justify-between p-sm md:p-md border-b border-border-subtle bg-surface-container-lowest flex-shrink-0">
        <div class="flex items-center gap-xs">
          <button class="flex items-center gap-xs px-md py-xs rounded-lg text-body-sm font-bold transition-all ${rightSidebarTab === 'pinned' ? 'bg-surface-container-high text-text-high-contrast shadow-xs' : 'text-text-muted hover:text-text-high-contrast'}" onclick="CumuApp.setRightSidebarTab('pinned')">
            <span class="material-symbols-outlined text-[18px] text-primary" style="font-variation-settings: 'FILL' 1;">push_pin</span>
            Angepinnt (${pinnedCards.length})
          </button>
          <button class="flex items-center gap-xs px-md py-xs rounded-lg text-body-sm font-bold transition-all ${rightSidebarTab === 'queue' ? 'bg-surface-container-high text-text-high-contrast shadow-xs' : 'text-text-muted hover:text-text-high-contrast'}" onclick="CumuApp.setRightSidebarTab('queue')">
            <span class="material-symbols-outlined text-[18px]">queue_music</span>
            Queue (${queue.length})
          </button>
        </div>
        <button class="w-8 h-8 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast flex items-center justify-center transition-colors hover:scale-105 active:scale-95" onclick="CumuApp.toggleQueue()" title="Schließen">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>`;

    containerEl.innerHTML = `
      ${headerHTML}
      <div class="queue-items-list flex-1 overflow-y-auto p-md space-y-xs">
        ${listHTML}
      </div>`;

    let draggedIdx = null;
    const itemsList = containerEl.querySelector('.queue-items-list');
    if (itemsList) {
      itemsList.querySelectorAll('.queue-drag-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          const idx = parseInt(item.dataset.index, 10);
          if (idx === queueIndex) {
            e.preventDefault();
            return false;
          }
          draggedIdx = idx;
          item.classList.add('opacity-40');
          e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
          item.classList.remove('opacity-40');
          itemsList.querySelectorAll('.queue-drag-item').forEach(i => i.style.borderTop = '');
        });

        item.addEventListener('dragover', (e) => {
          const dropIdx = parseInt(item.dataset.index, 10);
          if (dropIdx === queueIndex) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          item.style.borderTop = '2px solid var(--color-primary, #0969DA)';
        });

        item.addEventListener('dragleave', () => {
          item.style.borderTop = '';
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          item.style.borderTop = '';
          const dropIdx = parseInt(item.dataset.index, 10);
          if (draggedIdx === null || draggedIdx === dropIdx || draggedIdx === queueIndex || dropIdx === queueIndex) return;

          const [moved] = queue.splice(draggedIdx, 1);
          queue.splice(dropIdx, 0, moved);

          if (queueIndex === draggedIdx) queueIndex = dropIdx;
          else if (draggedIdx < queueIndex && dropIdx >= queueIndex) queueIndex--;
          else if (draggedIdx > queueIndex && dropIdx <= queueIndex) queueIndex++;

          updateQueueUI();
        });
      });
    }

    requestAnimationFrame(() => {
      const active = containerEl.querySelector('.queue-drag-item.active');
      if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function showQueuePanel(forceOpen = false) {
    const existing = document.getElementById('cumuQueuePanel');
    if (existing && !forceOpen) {
      existing.remove();
      return;
    }
    if (existing) {
      existing.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'cumuQueuePanel';
    panel.className = 'fixed inset-0 z-[10000] flex justify-end pointer-events-none xl:hidden';

    panel.innerHTML = `
      <!-- Backdrop -->
      <div id="cumuQueueBackdrop" class="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto transition-opacity duration-300"></div>

      <!-- Right Side Widget Drawer Container -->
      <div role="dialog" aria-modal="true" aria-label="Warteschlange" class="queue-drawer-container pointer-events-auto relative w-full max-w-md h-full bg-background border-l border-border-subtle shadow-2xl flex flex-col z-10 animate-slide-in-right">
      </div>`;

    panel.querySelector('#cumuQueueBackdrop').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);

    const mobileDrawer = panel.querySelector('.queue-drawer-container');
    renderQueueContent(mobileDrawer, true);
  }

  function jumpToQueueIndex(index) {
    if (index < 0 || index >= queue.length) return;
    queueIndex = index;
    playSong(queue[queueIndex]);
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  async function loadPlaylists() {
    try {
      playlists = await CumuApi.get('/api/playlists');
    } catch (_) {}
  }



  function renderSection(title, songs) {
    return `
      <section class="mb-xl">
        <h2 class="text-title-md font-title-md text-text-high-contrast mb-md font-bold">${esc(title)}</h2>
        <div class="flex flex-col gap-xs">
          ${songs.map((s, idx) => renderSongRow(s, idx + 1)).join('')}
        </div>
      </section>`;
  }

  function renderCoverPlaceholder(iconName = 'album', size = 'medium') {
    return `<div class="w-full h-full bg-surface-container flex items-center justify-center text-text-muted rounded-lg"><span class="material-symbols-outlined text-[32px]">album</span></div>`;
  }

  function renderArtistAvatarPlaceholder(name = 'Künstler', size = 'large') {
    const initial = (name || '?')[0].toUpperCase();
    return `
      <div class="w-24 h-24 rounded-full bg-text-high-contrast text-on-primary flex items-center justify-center font-bold text-2xl">
        ${initial}
      </div>`;
  }

  function renderSongRow(s, index) {
    const coverSrc = s.cover ? `/stream/cover/${s.cover}` : null;
    return `
      <div class="flex items-center gap-md py-md px-sm rounded-lg hover:bg-surface-container-low transition-colors group cursor-pointer song-item" data-song-id="${s.id}">
        ${index ? `<div class="text-label-caps font-label-caps text-text-muted w-6 text-center">${index}</div>` : ''}
        <div class="w-12 h-12 rounded bg-surface-container flex-shrink-0 overflow-hidden relative">
          ${coverSrc
            ? `<img src="${coverSrc}" class="w-full h-full object-cover" alt="cover">`
            : `<div class="w-full h-full flex items-center justify-center bg-surface-container-low text-text-muted"><span class="material-symbols-outlined text-[20px]">music_note</span></div>`
          }
          <div class="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="material-symbols-outlined text-white text-[24px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-body-lg font-body-lg text-text-high-contrast truncate group-hover:text-interactive-hover transition-colors font-medium">${esc(s.title)}</div>
          <div class="text-body-sm font-body-sm text-text-muted truncate mt-xs">${esc(s.artist_name || 'Unbekannter Künstler')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
        </div>
        <div class="text-label-caps font-label-caps text-text-muted mr-md">${formatTime(s.duration)}</div>
        <button class="text-text-muted hover:text-text-high-contrast p-xs rounded-full hover:bg-surface-container transition-colors song-menu-btn" onclick="event.stopPropagation(); CumuApp.openSongMenu(event, this, '${s.id}')">
          <span class="material-symbols-outlined text-[20px]">more_vert</span>
        </button>
      </div>`;
  }

  function renderPodcastCard(p) {
    const cover = p.cover || '';
    return `
      <div class="podcast-card group cursor-pointer flex flex-col gap-xs transition-transform duration-300 hover:scale-[1.02] active:scale-95"
           data-podcast-id="${esc(p.id)}"
           data-podcast-feed="${esc(p.feedUrl || '')}"
           data-podcast-title="${esc(p.title)}"
           data-podcast-cover="${esc(cover)}">
        <div class="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-container-low shadow-elevation-1 group-hover:shadow-elevation-2 transition-shadow">
          ${cover ? `<img src="${cover}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[48px]">podcasts</span></div>`}
          ${p.badge ? `<span class="absolute top-xs right-xs bg-primary text-on-primary text-[10px] font-bold uppercase tracking-wider px-xs py-[2px] rounded shadow">${esc(p.badge)}</span>` : ''}
        </div>
        <h3 class="text-body-lg font-body-lg text-text-high-contrast font-bold truncate mt-xs">${esc(p.title)}</h3>
        <p class="text-body-sm font-body-sm text-text-muted truncate">${esc(p.artist || '')}</p>
      </div>
    `;
  }

  function renderPodcastRow(p) {
    const cover = p.cover || '';
    return `
      <div class="podcast-card group cursor-pointer flex items-center justify-between p-sm md:p-md bg-surface-bright border border-border-subtle rounded-xl hover:bg-surface-container-low transition-all active:scale-[0.99]"
           data-podcast-id="${esc(p.id)}"
           data-podcast-feed="${esc(p.feedUrl || '')}"
           data-podcast-title="${esc(p.title)}"
           data-podcast-cover="${esc(cover)}">
        <div class="flex items-center gap-md min-w-0 flex-1 pr-md">
          <div class="w-14 h-14 rounded-lg overflow-hidden bg-surface-container-low flex-shrink-0 shadow-sm relative">
            ${cover ? `<img src="${cover}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[28px]">podcasts</span></div>`}
          </div>
          <div class="flex flex-col min-w-0 flex-1">
            <h3 class="text-body-lg font-bold text-text-high-contrast truncate group-hover:text-primary transition-colors">${esc(p.title)}</h3>
            <p class="text-body-sm text-text-muted truncate mt-[2px]">${esc(p.artist || 'Podcast')}</p>
          </div>
        </div>
        <div class="flex items-center gap-xs text-text-muted group-hover:text-text-high-contrast flex-shrink-0">
          <span class="text-label-caps font-label-caps uppercase bg-surface-container-low px-xs py-xxs rounded text-[11px] font-bold">Podcast</span>
          <span class="material-symbols-outlined text-[20px]">chevron_right</span>
        </div>
      </div>
    `;
  }

  function bindPodcastCards(container = document) {
    container.querySelectorAll('.podcast-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const id = card.getAttribute('data-podcast-id');
        const feedUrl = card.getAttribute('data-podcast-feed');
        const title = card.getAttribute('data-podcast-title');
        const cover = card.getAttribute('data-podcast-cover');
        openPodcast(id, feedUrl, title, cover);
      });
    });
  }

  function bindSongRows() {
    main.querySelectorAll('.song-item').forEach(row => {
      row.addEventListener('click', async () => {
        const songId = row.dataset.songId;
        if (window._currentPageSongs && window._currentPageSongs.length > 0) {
          const findIdx = window._currentPageSongs.findIndex(s => s.id === songId);
          if (findIdx !== -1) {
            playQueue(window._currentPageSongs, findIdx);
            return;
          }
        }
        const song = await CumuApi.get(`/api/songs/${songId}`);
        playSong(song);
      });
    });
  }

  let searchTimeout;
  async function renderDiscover() {
    main.innerHTML = `
      <div class="max-w-[1280px] mx-auto space-y-xl">
        <!-- Search Header Area -->
        <header class="w-full py-lg sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border-subtle">
          <div class="max-w-4xl mx-auto relative flex items-center w-full search-input-container">
            <span class="material-symbols-outlined search-icon text-text-muted text-[28px]">search</span>
            <input id="searchInput" class="w-full pr-md py-md bg-surface-bright border-b border-border-subtle text-title-md font-title-md placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors rounded-none bg-transparent" placeholder="Künstler, Songs oder Podcasts suchen" type="text" autofocus>
          </div>
        </header>

        <!-- Discovery Grid -->
        <div id="searchResults">
        </div>
      </div>`;

    document.getElementById('searchInput')?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const q = e.target.value;
      searchTimeout = setTimeout(async () => {
        const container = document.getElementById('searchResults');
        if (!container) return;
        if (!q.trim()) {
          renderBrowseGrid();
          return;
        }
        const res = await CumuApi.get(`/api/search?q=${encodeURIComponent(q)}`);
        let html = '';
        if (res.songs?.length) {
          html += `<h2 class="text-title-md font-title-md font-bold mb-md">Songs</h2><div class="flex flex-col gap-xs mb-xl">${res.songs.map((s, i) => renderSongRow(s, i+1)).join('')}</div>`;
        }
        if (res.albums?.length) {
          html += `<h2 class="text-title-md font-title-md font-bold mb-md">Alben</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-md mb-xl">${res.albums.map(renderAlbumCard).join('')}</div>`;
        }
        if (res.artists?.length) {
          html += `
            <h2 class="text-title-md font-title-md font-bold mb-md">Künstler</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-md mb-xl">
              ${res.artists.map(a => `
                <div class="group cursor-pointer flex flex-col items-center gap-xs p-md rounded-xl bg-surface-container-low hover:bg-surface-bright transition-all" onclick="navigate('artist', '${esc(a.id)}')">
                  <div class="w-24 h-24 rounded-full overflow-hidden bg-surface-container shadow-sm">
                    ${a.image ? `<img src="${a.image}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[36px]">person</span></div>`}
                  </div>
                  <span class="text-body-lg font-bold text-text-high-contrast truncate mt-xs">${esc(a.name)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
        if (res.playlists?.length) {
          html += `
            <h2 class="text-title-md font-title-md font-bold mb-md">Playlists</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-md mb-xl">
              ${res.playlists.map(pl => `
                <div class="group cursor-pointer flex flex-col gap-xs p-md rounded-xl bg-surface-container-low hover:bg-surface-bright transition-all" onclick="navigate('playlist', '${esc(pl.id)}')">
                  <div class="w-full aspect-square rounded-lg overflow-hidden bg-surface-container shadow-sm flex items-center justify-center text-text-muted">
                    <span class="material-symbols-outlined text-[48px]">queue_music</span>
                  </div>
                  <span class="text-body-lg font-bold text-text-high-contrast truncate mt-xs">${esc(pl.name)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
        if (res.podcasts?.length) {
          html += `
            <h2 class="text-title-md font-title-md font-bold mb-md">Podcasts</h2>
            <div class="flex flex-col gap-xs mb-xl">
              ${res.podcasts.map(renderPodcastRow).join('')}
            </div>
          `;
        }
        if (!html) html = `<p class="text-body-lg text-text-muted py-xl text-center">Keine Ergebnisse für "${esc(q)}"</p>`;
        container.innerHTML = html;
        bindSongRows();
        bindPodcastCards(container);
      }, 300);
    });

    renderBrowseGrid();
  }

  async function renderBrowseGrid() {
    const container = document.getElementById('searchResults');
    if (!container) return;
    
    container.innerHTML = `<div class="flex items-center justify-center py-xl">
      <span class="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
    </div>`;

    let stats = null;
    try {
      stats = await CumuApi.get('/api/genres/stats');
    } catch (e) {
      console.error(e);
      container.innerHTML = '';
      return;
    }

    if (!document.getElementById('searchResults')) return;

    if (!stats || (stats.topGenres.length === 0 && !stats.mostPlayedGenre)) {
      container.innerHTML = '';
      return;
    }

    let html = `<h2 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg mb-lg font-bold">Browse all</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-md md:gap-gutter auto-rows-[160px] md:auto-rows-[200px]">`;

    const colors = ['bg-primary-fixed-dim', 'bg-secondary-fixed', 'bg-tertiary-fixed'];

    stats.topGenres.forEach((g, idx) => {
      const bg = colors[idx % colors.length];
      if (idx === 0) {
        html += `
          <a class="col-span-2 row-span-2 rounded-lg bg-surface-container p-md relative overflow-hidden group hover:opacity-95 transition-opacity active:scale-95 duration-100" href="#" onclick="navigate('genre','${esc(g.genre)}'); return false;">
            <div class="absolute inset-0 bg-gradient-to-br from-primary-fixed to-surface-variant opacity-50"></div>
            <div class="relative z-10 flex flex-col h-full justify-between">
              <span class="text-title-md font-title-md text-text-high-contrast font-bold">Top Genre: ${esc(g.genre)}</span>
            </div>
          </a>
        `;
      } else {
        html += `
            <span class="text-title-md font-title-md text-text-high-contrast relative z-10 font-bold">${esc(g.genre)}</span>
            <div class="absolute -bottom-4 -right-4 w-24 h-24 rounded bg-background/40 rotate-[25deg]"></div>
          </a>
        `;
      }
    });

    if (stats.mostPlayedGenre && !stats.topGenres.find(t => t.genre === stats.mostPlayedGenre)) {
      html += `
        <a class="rounded-lg bg-surface-container-low border border-border-subtle p-md relative overflow-hidden group hover:bg-surface-container transition-colors active:scale-95 duration-100" href="#" onclick="navigate('genre','${esc(stats.mostPlayedGenre)}'); return false;">
          <span class="text-title-md font-title-md text-text-high-contrast relative z-10 font-bold">Your Favorite: ${esc(stats.mostPlayedGenre)}</span>
          <div class="absolute -bottom-4 -right-4 w-24 h-24 rounded bg-surface-variant rotate-[25deg]"></div>
        </a>
      `;
    }

    if (currentUser?.enablePodcasts !== false) {
      html += `
        <a class="col-span-2 rounded-lg bg-surface-dim p-md relative overflow-hidden group hover:opacity-95 transition-opacity flex items-center justify-between active:scale-95 duration-100" href="#" onclick="navigate('podcasts'); return false;">
          <span class="text-title-md font-title-md text-text-high-contrast relative z-10 font-bold">Live Sets & Podcasts</span>
          <span class="material-symbols-outlined text-[48px] text-text-muted opacity-20 relative z-10">mic</span>
        </a>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }


  function renderAlbumCard(a) {
    const coverSrc = a.cover ? `/stream/cover/${a.cover}` : null;
    return `
      <div class="bg-surface-bright border border-border-subtle p-md rounded-lg cursor-pointer hover:bg-surface-container-low transition-all" onclick="navigate('album','${a.id}')">
        <div class="w-full aspect-square bg-surface-container rounded-lg overflow-hidden mb-md flex items-center justify-center">
          ${coverSrc
            ? `<img src="${coverSrc}" class="w-full h-full object-cover" alt="${esc(a.title)}">`
            : `<span class="material-symbols-outlined text-[48px] text-text-muted">album</span>`
          }
        </div>
        <h3 class="text-title-md font-title-md text-text-high-contrast font-bold truncate">${esc(a.title)}</h3>
        <p class="text-body-sm text-text-muted truncate mt-xs">${esc(a.artist_name || 'Unbekannter Künstler')} ${a.year ? '(' + a.year + ')' : ''}</p>
      </div>`;
  }

  async function renderLibrary() {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Lade Mediathek…</div>';
    const lib = await CumuApi.get('/api/library');
    await loadPlaylists();

    const pinnedKeys = getPinnedKeys();

    // Map pinned keys to display cards
    const pinnedCards = [];
    for (const key of pinnedKeys) {
      if (key === PIN_KEYS.PODCASTS) {
        if (currentUser?.enablePodcasts !== false) {
          pinnedCards.push({
            key,
            title: 'Podcasts',
            subtitle: 'Shows & Episoden',
            typeLabel: 'Podcast',
            icon: 'podcasts',
            onClick: "navigate('podcasts')",
            bgClass: 'bg-primary-fixed/30',
            iconColor: 'text-primary'
          });
        }
      } else if (key === PIN_KEYS.FAVORITES) {
        pinnedCards.push({
          key,
          title: 'Lieblingslieder',
          subtitle: `${favorites.size} Titel`,
          typeLabel: 'Kategorie',
          icon: 'favorite',
          onClick: "navigate('favorites')",
          bgClass: 'bg-error-container/30',
          iconColor: 'text-error'
        });
      } else if (key.startsWith('playlist:')) {
        const plId = key.replace('playlist:', '');
        const pl = playlists.find(p => p.id === plId);
        if (pl) {
          pinnedCards.push({
            key,
            title: pl.name,
            subtitle: pl.description || 'Playlist',
            typeLabel: 'Playlist',
            icon: 'queue_music',
            cover: pl.cover || null,
            onClick: `navigate('playlist','${pl.id}')`,
            bgClass: 'bg-surface-container-low',
            iconColor: 'text-primary'
          });
        }
      }
    }

    main.innerHTML = `
      <div class="max-w-[1280px] mx-auto space-y-xl">
        <header class="mb-lg md:mb-xl flex flex-col md:flex-row md:items-center justify-between gap-md">
          <div>
            <h1 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-text-high-contrast font-bold">Library</h1>
            <p class="text-body-sm font-body-sm text-text-muted mt-xs">Deine persönliche Musiksammlung.</p>
          </div>
        </header>

        <!-- Playlists & Schnellzugriff Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          <!-- Playlists Section (8 cols) -->
          <section class="md:col-span-8 bg-surface-bright border border-border-subtle rounded-xl p-lg flex flex-col h-full">
            <div class="flex justify-between items-center mb-md border-b border-border-subtle pb-sm">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold">Playlists</h2>
              <div class="flex items-center gap-md">
                <button class="text-label-caps font-label-caps text-primary hover:underline font-bold uppercase text-xs" onclick="CumuApp.createPlaylist()">+ Neue Playlist</button>
                <a class="text-label-caps font-label-caps text-text-muted hover:text-text-high-contrast transition-colors uppercase" href="#" onclick="navigate('playlists'); return false;">Alle anzeigen</a>
              </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-md flex-1">
              ${playlists.map(p => {
                const pKey = `playlist:${p.id}`;
                const pPinned = pinnedKeys.includes(pKey);
                return `
                  <div class="group relative bg-background border border-border-subtle rounded-xl p-md cursor-pointer hover:scale-[1.02] hover:border-primary/40 transition-all duration-200 flex flex-col justify-between" onclick="navigate('playlist','${p.id}')">
                    <button class="absolute top-3 right-3 w-8 h-8 rounded-full ${pPinned ? 'text-primary bg-surface-container' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-primary bg-surface-container'} flex items-center justify-center transition-all z-10 shadow-sm" onclick="CumuApp.togglePin('${pKey}', event)" title="${pPinned ? 'Abpinnen' : 'Anpinnen'}">
                      <span class="material-symbols-outlined text-[18px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
                    </button>
                    <div class="aspect-square rounded-lg overflow-hidden mb-sm border border-border-subtle bg-surface-container-low flex items-center justify-center relative">
                      ${p.cover ? `<img src="${p.cover}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />` : `<span class="material-symbols-outlined text-[44px] text-text-muted">queue_music</span>`}
                    </div>
                    <div>
                      <div class="flex items-center gap-xs">
                        <h3 class="text-body-sm font-body-sm text-text-high-contrast font-medium truncate flex-1">${esc(p.name)}</h3>
                        ${pPinned ? `<span class="material-symbols-outlined text-primary text-[14px]" style="font-variation-settings: 'FILL' 1;" title="Angepinnt">push_pin</span>` : ''}
                      </div>
                      <p class="text-body-sm font-body-sm text-text-muted truncate">${esc(p.description || 'Playlist')}</p>
                    </div>
                  </div>`;
              }).join('') || '<p class="text-body-sm text-text-muted col-span-full">Keine Playlists vorhanden.</p>'}
            </div>
          </section>

          <!-- Schnellzugriff Section (4 cols) -->
          <section class="md:col-span-4 bg-surface-bright border border-border-subtle rounded-xl p-lg flex flex-col h-full">
            <div class="flex justify-between items-center mb-md border-b border-border-subtle pb-sm">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold">Schnellzugriff</h2>
            </div>
            <div class="flex flex-col gap-md">
              ${(() => {
                const favPinned = pinnedKeys.includes(PIN_KEYS.FAVORITES);
                return `
                  <div class="group flex items-center justify-between p-sm rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors" onclick="navigate('favorites')">
                    <div class="flex items-center gap-md">
                      <div class="w-10 h-10 rounded-lg bg-error-container/40 flex items-center justify-center text-error">
                        <span class="material-symbols-outlined text-[24px]">favorite</span>
                      </div>
                      <div>
                        <h3 class="text-body-lg font-medium text-text-high-contrast">Lieblingslieder</h3>
                        <p class="text-body-sm text-text-muted">${favorites.size} Titel</p>
                      </div>
                    </div>
                    <button class="w-8 h-8 rounded-full ${favPinned ? 'text-primary' : 'text-text-muted opacity-40 group-hover:opacity-100 hover:text-primary'} flex items-center justify-center transition-all" onclick="CumuApp.togglePin('${PIN_KEYS.FAVORITES}', event)" title="${favPinned ? 'Abpinnen' : 'Anpinnen'}">
                      <span class="material-symbols-outlined text-[18px]" style="${favPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
                    </button>
                  </div>`;
              })()}

              ${currentUser?.enablePodcasts !== false ? (() => {
                const podPinned = pinnedKeys.includes(PIN_KEYS.PODCASTS);
                return `
                  <div class="group flex items-center justify-between p-sm rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors" onclick="navigate('podcasts')">
                    <div class="flex items-center gap-md">
                      <div class="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined text-[24px]">podcasts</span>
                      </div>
                      <div>
                        <h3 class="text-body-lg font-medium text-text-high-contrast">Podcasts</h3>
                        <p class="text-body-sm text-text-muted">Shows & Episoden</p>
                      </div>
                    </div>
                    <button class="w-8 h-8 rounded-full ${podPinned ? 'text-primary' : 'text-text-muted opacity-40 group-hover:opacity-100 hover:text-primary'} flex items-center justify-center transition-all" onclick="CumuApp.togglePin('${PIN_KEYS.PODCASTS}', event)" title="${podPinned ? 'Abpinnen' : 'Anpinnen'}">
                      <span class="material-symbols-outlined text-[18px]" style="${podPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
                    </button>
                  </div>`;
              })() : ''}
            </div>
          </section>
        </div>

        <!-- Gespeicherte Songs Section -->
        <section class="bg-surface-bright border border-border-subtle rounded-xl p-lg">
          <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-md">Gespeicherte Songs</h2>
          <div class="flex flex-col gap-xs">
            ${(lib.songs || []).map((s, idx) => renderSongRow(s, idx + 1)).join('') || '<p class="text-body-sm text-text-muted">Keine Songs vorhanden.</p>'}
          </div>
        </section>
      </div>`;
    bindSongRows();
  }

  function renderContinueCard(progress) {
    if (!progress || !progress.episodeTitle) return '';
    const cover = progress.cover || '';
    const cur = progress.currentTime || 0;
    const dur = progress.duration || 0;
    const pct = dur > 0 ? Math.min(100, Math.round((cur / dur) * 100)) : 0;
    const remSeconds = Math.max(0, dur - cur);
    const remMinutes = Math.ceil(remSeconds / 60);

    const safeProgressStr = JSON.stringify(progress).replace(/'/g, "&#39;");

    return `
      <div class="bg-surface-bright border border-border-subtle rounded-xl p-md md:p-lg flex flex-col md:flex-row items-center gap-md shadow-elevation-1 hover:border-primary/50 transition-all group">
        <div class="relative w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden bg-surface-container-low flex-shrink-0 shadow-sm">
          ${cover ? `<img src="${cover}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[40px]">podcasts</span></div>`}
          <button onclick='resumePodcastEpisode(${safeProgressStr})' class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <span class="material-symbols-outlined text-[44px]">play_circle</span>
          </button>
        </div>

        <div class="flex-1 flex flex-col justify-between w-full">
          <div>
            <div class="flex items-center gap-xs text-xs font-semibold text-primary uppercase tracking-wider mb-xs">
              <span class="material-symbols-outlined text-[16px]">resume</span> Weiterhören
            </div>
            <h3 class="text-title-md font-bold text-text-high-contrast truncate">${esc(progress.episodeTitle)}</h3>
            <p class="text-body-sm text-text-muted truncate mt-[2px]">${esc(progress.podcastTitle)}</p>
          </div>

          <div class="mt-md">
            <div class="flex items-center justify-between text-body-xs text-text-muted mb-xs font-mono">
              <span>${formatTime(cur)}</span>
              <span>${remMinutes > 0 ? `Noch ca. ${remMinutes} Min.` : formatTime(dur)}</span>
            </div>
            <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>

        <div class="flex-shrink-0 self-end md:self-center">
          <button onclick='resumePodcastEpisode(${safeProgressStr})' class="flex items-center gap-xs px-lg py-md bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-hover active:scale-95 transition-all shadow-sm">
            <span class="material-symbols-outlined text-[20px]">play_arrow</span>
            Weiterhören
          </button>
        </div>
      </div>
    `;
  }

  async function renderPodcasts() {
    main.innerHTML = `
      <div class="p-md md:p-margin-desktop w-full">
        <!-- Header -->
        <header class="mb-xl">
          <div class="flex items-center justify-between mb-xs">
            <h1 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg text-text-high-contrast font-bold">Podcasts</h1>
            ${(() => {
              const podPinned = isPinned(PIN_KEYS.PODCASTS);
              return `
                <button class="py-xs px-md rounded-lg border border-border-subtle bg-surface-bright text-text-high-contrast hover:bg-surface-container-low transition-all flex items-center gap-xs text-body-sm font-medium" onclick="CumuApp.togglePin('${PIN_KEYS.PODCASTS}', event)" title="${podPinned ? 'Vom Dashboard abpinnen' : 'An Mediathek anpinnen'}">
                  <span class="material-symbols-outlined text-[18px] text-primary" style="${podPinned ? "font-variation-settings: 'FILL' 1;" : ''}">${podPinned ? 'push_pin' : 'push_pin'}</span>
                  ${podPinned ? 'Angepinnt' : 'Anpinnen'}
                </button>`;
            })()}
          </div>
          <p class="text-body-lg font-body-lg text-text-muted mb-md">Entdecke neue Stimmen, Vorträge und Geschichten.</p>

          <div class="relative flex items-center w-full max-w-xl search-input-container compact">
            <span class="material-symbols-outlined search-icon text-text-muted text-[24px]">search</span>
            <input id="podcastSearchInput" class="w-full pr-md py-md bg-surface-bright border border-border-subtle rounded-lg text-body-md placeholder:text-text-muted focus:outline-none focus:border-text-high-contrast transition-colors text-text-high-contrast shadow-sm" placeholder="Podcast nach Name oder Thema suchen..." type="text">
          </div>
        </header>

        <!-- Search Results (hidden when not searching) -->
        <section id="podcastSearchResultsSection" class="mb-xl hidden">
          <div class="flex items-center justify-between mb-lg">
            <h2 id="podcastSearchResultTitle" class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
              <span class="material-symbols-outlined text-primary">search</span>
              Suchergebnisse
            </h2>
          </div>
          <div id="podcastSearchGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter"></div>
        </section>

        <!-- Main Content (4 sections in order) -->
        <div id="podcastMainSections">
          <!-- 1. Weiterhören -->
          <section id="podcastContinueSection" class="mb-xl hidden">
            <div class="flex items-center justify-between mb-md">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">resume</span>
                Weiterhören
              </h2>
            </div>
            <div id="podcastContinueContainer"></div>
          </section>

          <!-- 2. Oft gehört -->
          <section id="podcastFrequentlySection" class="mb-xl hidden">
            <div class="flex items-center justify-between mb-lg">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">history</span>
                Oft gehört
              </h2>
            </div>
            <div id="podcastFrequentlyGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter"></div>
          </section>

          <!-- 3. Empfohlen (Instanz-Nutzer) -->
          <section id="podcastRecommendedSection" class="mb-xl hidden">
            <div class="flex items-center justify-between mb-lg">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">groups</span>
                Empfohlen
                <span class="text-body-sm font-normal text-text-muted ml-xs">(Beliebt in deiner Cumu-Instanz)</span>
              </h2>
            </div>
            <div id="podcastRecommendedGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter"></div>
          </section>

          <!-- 4. Weltweite Trends (Am Ende) -->
          <section id="podcastGlobalSection" class="mb-xl">
            <div class="flex items-center justify-between mb-lg">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">public</span>
                Weltweite Trends
              </h2>
            </div>
            <div id="podcastGlobalGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
              <div class="col-span-full text-center text-text-muted py-xl">Lade Podcasts...</div>
            </div>
          </section>
        </div>
      </div>`;

    let podcastSearchTimeout;
    const podcastSearchInput = document.getElementById('podcastSearchInput');
    const searchSection = document.getElementById('podcastSearchResultsSection');
    const searchGrid = document.getElementById('podcastSearchGrid');
    const searchTitle = document.getElementById('podcastSearchResultTitle');
    const mainSections = document.getElementById('podcastMainSections');

    if (podcastSearchInput) {
      podcastSearchInput.addEventListener('input', (e) => {
        clearTimeout(podcastSearchTimeout);
        const q = e.target.value.trim();
        podcastSearchTimeout = setTimeout(async () => {
          if (!q) {
            if (searchSection) searchSection.classList.add('hidden');
            if (mainSections) mainSections.classList.remove('hidden');
            return;
          }
          if (searchSection) searchSection.classList.remove('hidden');
          if (mainSections) mainSections.classList.add('hidden');
          if (searchTitle) searchTitle.textContent = `Suchergebnisse für "${esc(q)}"`;
          if (searchGrid) searchGrid.innerHTML = '<div class="col-span-full text-center text-text-muted py-xl">Suche Podcasts...</div>';
          try {
            const res = await CumuApi.get(`/api/podcasts/search?q=${encodeURIComponent(q)}`);
            if (res && res.success && res.podcasts && res.podcasts.length > 0) {
              searchGrid.innerHTML = res.podcasts.map(renderPodcastCard).join('');
              bindPodcastCards(searchGrid);
            } else {
              searchGrid.innerHTML = `<div class="col-span-full text-center text-text-muted py-xl">Keine Podcasts für "${esc(q)}" gefunden.</div>`;
            }
          } catch (err) {
            console.error(err);
            if (searchGrid) searchGrid.innerHTML = '<div class="col-span-full text-center text-red-400 py-xl">Fehler bei der Podcast-Suche.</div>';
          }
        }, 300);
      });
    }

    async function loadPodcastSections() {
      try {
        const res = await CumuApi.get('/api/podcasts/recommendations');
        const continueSection = document.getElementById('podcastContinueSection');
        const continueContainer = document.getElementById('podcastContinueContainer');
        const freqSection = document.getElementById('podcastFrequentlySection');
        const freqGrid = document.getElementById('podcastFrequentlyGrid');
        const recSection = document.getElementById('podcastRecommendedSection');
        const recGrid = document.getElementById('podcastRecommendedGrid');
        const globalGrid = document.getElementById('podcastGlobalGrid');

        // Section 1: Weiterhören
        let localProgress = null;
        try { localProgress = JSON.parse(localStorage.getItem('cumu_podcast_progress')); } catch (_) {}
        const progressState = res?.continueListening || localProgress;

        if (progressState && progressState.episodeTitle && continueSection && continueContainer) {
          continueContainer.innerHTML = renderContinueCard(progressState);
          continueSection.classList.remove('hidden');
        }

        if (res && res.success) {
          // Section 2: Oft gehört
          if (res.frequentlyListened && res.frequentlyListened.length > 0 && freqSection && freqGrid) {
            freqSection.classList.remove('hidden');
            freqGrid.innerHTML = res.frequentlyListened.map(p => renderPodcastCard({ ...p, badge: 'Oft gehört' })).join('');
            bindPodcastCards(freqGrid);
          }

          // Section 3: Empfohlen (Instanz-Nutzer)
          if (res.instanceRecommendations && res.instanceRecommendations.length > 0 && recSection && recGrid) {
            recSection.classList.remove('hidden');
            recGrid.innerHTML = res.instanceRecommendations.map(renderPodcastCard).join('');
            bindPodcastCards(recGrid);
          }

          // Section 4: Weltweite Trends (Am Ende)
          if (res.globalTrending && res.globalTrending.length > 0 && globalGrid) {
            globalGrid.innerHTML = res.globalTrending.map(renderPodcastCard).join('');
            bindPodcastCards(globalGrid);
          } else if (globalGrid) {
            globalGrid.innerHTML = '<div class="col-span-full text-center text-text-muted py-xl">Keine Trends gefunden.</div>';
          }
        }
      } catch (e) {
        console.error(e);
        const globalGrid = document.getElementById('podcastGlobalGrid');
        if (globalGrid) globalGrid.innerHTML = '<div class="col-span-full text-center text-red-400 py-xl">Fehler beim Laden.</div>';
      }
    }

    loadPodcastSections();
  }

  const openPodcast = async (id, feedUrl, title, cover) => {
    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
        <header class="flex items-center gap-lg mb-xl">
          <div class="w-32 h-32 md:w-48 md:h-48 rounded-lg overflow-hidden bg-surface-container-low shadow-elevation-2 flex-shrink-0">
            ${cover ? `<img src="${cover}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[48px]">podcasts</span></div>`}
          </div>
          <div class="flex flex-col gap-xs">
            <h1 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg text-text-high-contrast font-bold">${esc(title)}</h1>
            <p class="text-body-lg font-body-lg text-text-muted">Podcast laden...</p>
          </div>
        </header>
        <section>
          <h2 class="text-title-md font-title-md text-text-high-contrast border-b border-border-subtle pb-sm mb-md font-bold">Episoden</h2>
          <div id="podcastEpisodes" class="flex flex-col gap-xs">
            <div class="text-center text-text-muted py-xl">Lade Episoden...</div>
          </div>
        </section>
      </div>`;

    try {
      const res = await CumuApi.post('/api/podcasts/episodes', { id, feedUrl });
      const container = document.getElementById('podcastEpisodes');
      if (res && res.success && res.episodes && res.episodes.length > 0) {
        window.currentPodcastEpisodes = res.episodes.map(ep => ({
          ...ep,
          cover,
          artist: title,
          podcastTitle: title,
          podcastId: id,
          feedUrl,
          isPodcast: true
        }));
        
        container.innerHTML = window.currentPodcastEpisodes.map((ep, idx) => `
          <div class="flex items-center justify-between p-sm md:p-md rounded-lg hover:bg-surface-bright transition-colors group cursor-pointer border-b border-border-subtle last:border-0" onclick="CumuApp.playPodcastEpisode(${idx})">
            <div class="flex flex-col gap-[2px] flex-1 overflow-hidden pr-md">
              <h4 class="text-body-lg font-body-lg text-text-high-contrast truncate group-hover:text-primary transition-colors">${esc(ep.title)}</h4>
              <p class="text-body-sm font-body-sm text-text-muted line-clamp-2">${esc(stripHtml(ep.description || ''))}</p>
            </div>
            <div class="text-body-sm font-body-sm text-text-muted flex-shrink-0 text-right min-w-[60px]">
              ${ep.publishedAt ? new Date(ep.publishedAt * 1000).toLocaleDateString() : ''}
            </div>
            <button class="ml-md text-text-muted hover:text-on-surface transition-colors">
              <span class="material-symbols-outlined">play_circle</span>
            </button>
          </div>
        `).join('');
      } else {
        container.innerHTML = '<div class="text-center text-text-muted py-xl">Keine Episoden gefunden.</div>';
      }
    } catch (e) {
      console.error(e);
      document.getElementById('podcastEpisodes').innerHTML = '<div class="text-center text-red-400 py-xl">Fehler beim Laden der Episoden.</div>';
    }
  };

  const playPodcastEpisode = (index) => {
    if (!window.currentPodcastEpisodes) return;
    playQueue(window.currentPodcastEpisodes, index, true);
    navigate('nowplaying');
  };

  async function renderPlaylists() {
    await loadPlaylists();
    const pinnedKeys = getPinnedKeys();
    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
        <div class="flex items-center justify-between mb-xl">
          <div>
            <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold mb-xs">Playlists</h1>
            <p class="text-body-sm text-text-muted">Deine persönlichen Musiksammlungen</p>
          </div>
          <button class="py-md px-lg bg-text-high-contrast text-on-primary rounded-lg text-label-caps font-bold hover:bg-interactive-hover transition-all" onclick="CumuApp.createPlaylist()">
            + Neue Playlist
          </button>
        </div>
        ${playlists.length ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-md">
            ${playlists.map(p => {
              const pKey = `playlist:${p.id}`;
              const pPinned = pinnedKeys.includes(pKey);
              return `
                <div class="group relative bg-surface-bright border border-border-subtle p-md rounded-lg cursor-pointer hover:bg-surface-container-low transition-all" onclick="navigate('playlist','${p.id}')">
                  <button class="absolute top-3 right-3 w-8 h-8 rounded-full ${pPinned ? 'text-primary bg-surface-container' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-primary bg-surface-container'} flex items-center justify-center transition-all z-10 shadow-sm" onclick="CumuApp.togglePin('${pKey}', event)" title="${pPinned ? 'Vom Dashboard abpinnen' : 'An Mediathek anpinnen'}">
                    <span class="material-symbols-outlined text-[18px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
                  </button>
                  <div class="w-full aspect-square bg-surface-container rounded-lg flex items-center justify-center text-text-muted mb-md relative overflow-hidden">
                    ${p.cover ? `<img src="${p.cover}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />` : `<span class="material-symbols-outlined text-[48px]">queue_music</span>`}
                  </div>
                  <div class="flex items-center gap-xs">
                    <h3 class="text-title-md font-title-md text-text-high-contrast font-bold truncate flex-1">${esc(p.name)}</h3>
                    ${pPinned ? `<span class="material-symbols-outlined text-primary text-[16px]" style="font-variation-settings: 'FILL' 1;" title="Angepinnt">push_pin</span>` : ''}
                  </div>
                  <p class="text-body-sm text-text-muted truncate mt-xs">${esc(p.description || 'Playlist')}</p>
                </div>`;
            }).join('')}
          </div>`
          : `<div class="p-xl bg-surface-container-low border border-border-subtle rounded-xl text-center">
              <span class="material-symbols-outlined text-[48px] text-text-muted mb-md">queue_music</span>
              <h2 class="text-title-md font-bold mb-xs">Keine Playlists vorhanden</h2>
              <p class="text-body-sm text-text-muted mb-lg">Erstelle deine erste eigene Playlist!</p>
              <button class="py-md px-lg bg-text-high-contrast text-on-primary rounded-lg text-label-caps font-bold hover:bg-interactive-hover transition-all" onclick="CumuApp.createPlaylist()">Playlist erstellen</button>
            </div>`}
      </div>`;
  }

  async function renderFavorites() {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Lade Favoriten…</div>';
    const favArray = Array.from(favorites);
    const favPinned = isPinned(PIN_KEYS.FAVORITES);
    const pinBtnHtml = `
      <button class="py-xs px-md rounded-lg border border-border-subtle bg-surface-bright text-text-high-contrast hover:bg-surface-container-low transition-all flex items-center gap-xs text-body-sm font-medium" onclick="CumuApp.togglePin('${PIN_KEYS.FAVORITES}', event)" title="${favPinned ? 'Vom Dashboard abpinnen' : 'An Mediathek anpinnen'}">
        <span class="material-symbols-outlined text-[18px] text-primary" style="${favPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
        ${favPinned ? 'Angepinnt' : 'Anpinnen'}
      </button>
    `;

    if (!favArray.length) {
      main.innerHTML = `
        <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
          <div class="flex items-center justify-between mb-lg">
            <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold">Favoriten</h1>
            ${pinBtnHtml}
          </div>
          <div class="p-xl bg-surface-container-low border border-border-subtle rounded-xl text-center">
            <span class="material-symbols-outlined text-[48px] text-text-muted mb-md">favorite</span>
            <h2 class="text-title-md font-bold mb-xs">Noch keine Favoriten</h2>
            <p class="text-body-sm text-text-muted">Klicke auf das Herz-Symbol bei einem Song, um ihn hier zu speichern.</p>
          </div>
        </div>`;
      return;
    }
    const songs = [];
    for (const id of favArray) {
      try {
        const s = await CumuApi.get(`/api/songs/${id}`);
        if (s && s.id) songs.push(s);
      } catch (_) {}
    }
    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
        <div class="flex items-center justify-between mb-lg">
          <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold">Favoriten</h1>
          ${pinBtnHtml}
        </div>
        <div class="flex flex-col gap-xs">
          ${songs.map((s, idx) => renderSongRow(s, idx + 1)).join('')}
        </div>
      </div>`;
    bindSongRows();
  }

  async function renderGenre(genreName) {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Lade Genre…</div>';
    try {
      const res = await CumuApi.get(`/api/search?q=${encodeURIComponent(genreName || '')}`);
      main.innerHTML = `
        <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
          <header class="mb-xl">
            <span class="text-label-caps font-label-caps text-text-muted lowercase">Genre Overview</span>
            <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold mb-xs">${esc(genreName || 'Genre')}</h1>
            ${(typeof GENRE_DESCRIPTIONS !== 'undefined' && GENRE_DESCRIPTIONS[genreName]) ? `<p class="text-body-lg text-text-muted mt-sm">${esc(GENRE_DESCRIPTIONS[genreName])}</p>` : ''}
          </header>
          <div class="flex flex-col gap-xs">
            ${res.songs?.length ? res.songs.map((s, idx) => renderSongRow(s, idx + 1)).join('') : '<p class="text-body-sm text-text-muted">Keine Tracks in dieser Kategorie gefunden.</p>'}
          </div>
        </div>`;
      bindSongRows();
    } catch (_) {
      renderHome();
    }
  }

  async function createPlaylist(initialSongId) {
    let modal = document.getElementById('createPlaylistModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'createPlaylistModal';
      modal.className = 'fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-md';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="w-full max-w-[480px] bg-surface-container rounded-xl shadow-2xl border border-border-subtle p-lg flex flex-col gap-md">
        <div class="flex flex-col">
          <h2 class="font-title-lg text-title-lg text-on-surface font-bold m-0">Neue Playlist erstellen</h2>
          <p class="font-body-sm text-body-sm text-text-muted mt-xs">Gib der Playlist einen Namen, um Songs hinzuzufügen.</p>
        </div>
        <form id="createPlaylistForm" class="flex flex-col gap-md mt-md">
          <div class="flex flex-col gap-xs">
            <label class="font-body-sm text-body-sm text-on-surface font-medium">Playlist Name *</label>
            <input type="text" id="newPlName" required placeholder="z. B. Meine Favoriten" autofocus class="w-full bg-surface-container-low border border-border-subtle rounded-lg px-md py-sm font-body-lg text-body-lg text-on-surface focus:border-text-muted focus:ring-0 outline-none transition-colors" />
          </div>
          <div class="flex flex-col gap-xs">
            <label class="font-body-sm text-body-sm text-text-muted">Beschreibung (optional)</label>
            <input type="text" id="newPlDesc" placeholder="z. B. Entspannte Musik für unterwegs" class="w-full bg-surface-container-low border border-border-subtle rounded-lg px-md py-sm font-body-sm text-body-sm text-on-surface focus:border-text-muted focus:ring-0 outline-none transition-colors" />
          </div>
          <div class="flex items-center justify-end gap-sm mt-md pt-md border-t border-border-subtle">
            <button type="button" class="px-md py-sm rounded-lg font-body-sm text-body-sm text-text-muted hover:text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="document.getElementById('createPlaylistModal').style.display='none'">Abbrechen</button>
            <button type="submit" class="px-md py-sm rounded-lg font-body-sm text-body-sm bg-text-muted text-on-primary hover:scale-105 active:scale-95 transition-transform duration-200">Playlist erstellen</button>
          </div>
        </form>
      </div>
    `;
    modal.style.display = 'flex';

    const form = document.getElementById('createPlaylistForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('newPlName').value.trim();
      const description = document.getElementById('newPlDesc').value.trim();
      if (!name) return;

      modal.style.display = 'none';
      const newPl = await CumuApi.post('/api/playlists', { name, description });
      await loadPlaylists();

      if (initialSongId && newPl?.id) {
        await CumuApi.post(`/api/playlists/${newPl.id}/songs`, { songId: initialSongId });
      }

      showToast(`Playlist "${name}" erstellt!`);
      if (newPl?.id) {
        navigate('playlist', newPl.id);
      } else {
        navigate('library');
      }
    };
  }

  async function renderAlbum(albumId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">Lade Album…</div></div>';
    const album = await CumuApi.get(`/api/albums/${albumId}`);
    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;

    const totalDur = (album.songs || []).reduce((s, t) => s + (t.duration || 0), 0);
    const dur = totalDur > 0 ? `${Math.floor(totalDur/60)} Min.` : '';

    main.innerHTML = `
      <div class="page-hero" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:32px 24px;background:var(--surface-soft);border-radius:var(--radius-lg,16px);margin-bottom:32px">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:160px;height:160px;object-fit:cover;border-radius:var(--radius-md,12px);box-shadow:0 8px 24px rgba(0,0,0,0.2)" alt="cover">`
          : `<div style="width:160px;height:160px;display:flex;align-items:center;justify-content:center;background:var(--surface-card);border-radius:var(--radius-md,12px)">${CumuIcons.get('library')}</div>`
        }
        <div class="page-hero-info" style="flex:1;min-width:240px">
          <div class="mute" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Album</div>
          <h1 style="font-size:32px;font-weight:800;margin:0 0 6px 0">${esc(album.title)}</h1>
          <p class="mute" style="margin:0 0 16px 0">${esc(album.artist_name || 'Unbekannter Künstler')}${album.year ? ' &middot; ' + album.year : ''}${dur ? ' &middot; ' + dur : ''}</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="btn-primary" onclick="CumuApp.playAlbum('${album.id}')">${CumuIcons.get('play')} Album abspielen</button>
            <button class="btn-secondary" onclick="CumuApp.playNextPlaylist(window._currentAlbumSongs)">${CumuIcons.get('next')} Als Nächstes</button>
            <button class="btn-secondary" onclick="navigate('artist','${album.artist_id}')">Zum Künstler</button>
          </div>
        </div>
      </div>
      <div class="page-section">
        <h2 style="margin-bottom:12px">${(album.songs || []).length} Tracks</h2>
        <div class="song-list">${(album.songs || []).map((s, i) => renderSongRow(s, i + 1)).join('')}</div>
      </div>`;

    window._currentAlbumSongs = album.songs || [];
    bindSongRows();
  }

  async function playAlbum(albumId) {
    const album = await CumuApi.get(`/api/albums/${albumId}`);
    if (album.songs?.length) {
      playQueue(album.songs, 0, album.is_audiobook);
    }
  }

  async function renderArtist(artistId) {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Lade Künstler…</div>';
    const artist = await CumuApi.get(`/api/artists/${artistId}`);
    if (!artist) return;

    const songsCount = artist.song_count || (artist.songs || []).length;
    const albumsCount = artist.album_count || (artist.albums || []).length;
    const coverSrc = artist.cover ? `/stream/cover/${artist.cover}` : null;

    main.innerHTML = `
      <div class="max-w-[1280px] mx-auto space-y-xl">
        <!-- Artist Hero Section -->
        <section class="relative w-full min-h-[360px] overflow-hidden flex items-end rounded-xl bg-surface-container p-gutter md:p-margin-desktop relative">
          ${coverSrc ? `<div class="absolute inset-0 bg-cover bg-center opacity-30 blur-sm" style="background-image: url('${coverSrc}')"></div>` : ''}
          <div class="relative z-10 w-full">
            <span class="text-label-caps font-label-caps text-text-muted uppercase tracking-wider">Artist Profile</span>
            <h1 class="font-display-xl text-display-xl text-text-high-contrast mb-sm tracking-tighter font-bold">${esc(artist.name)}</h1>
            <p class="font-title-md text-title-md text-text-muted">${albumsCount} Alben &middot; ${songsCount} Tracks</p>
            <div class="mt-lg flex gap-md">
              <button class="bg-text-high-contrast text-on-primary px-6 py-2 rounded font-label-caps text-label-caps tracking-wider hover:scale-105 transition-transform duration-200 active:scale-95 flex items-center gap-2" onclick="CumuApp.playArtist('${artist.id}')">
                <span class="material-symbols-outlined text-[18px]">play_arrow</span> play all
              </button>
            </div>
          </div>
        </section>

        <!-- Discography & Tracks Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-xl">
          <div class="lg:col-span-2 flex flex-col gap-xl">
            ${artist.songs?.length ? `
              <section>
                <h3 class="font-title-md text-title-md text-on-surface mb-lg font-bold">Top Tracks</h3>
                <div class="flex flex-col gap-xs">
                  ${artist.songs.slice(0, 25).map((s, i) => renderSongRow(s, i + 1)).join('')}
                </div>
              </section>` : ''}
          </div>
          <div>
            ${artist.albums?.length ? `
              <section>
                <h3 class="font-title-md text-title-md text-on-surface mb-lg font-bold">Alben</h3>
                <div class="grid grid-cols-2 gap-md">
                  ${artist.albums.map(renderAlbumCard).join('')}
                </div>
              </section>` : ''}
          </div>
        </div>
      </div>`;
    bindSongRows();
  }

  async function renderPlaylist(playlistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">Lade Playlist…</div></div>';
    const pl = await CumuApi.get(`/api/playlists/${playlistId}`);
    if (!pl) return;

    const songs = pl.songs || [];
    window._currentPlaylistSongs = songs;
    const totalDur = songs.reduce((acc, t) => acc + (t.duration || 0), 0);
    const durStr = totalDur > 0 ? `${Math.floor(totalDur / 60)} Min.` : '';

    const pKey = `playlist:${pl.id}`;
    const pPinned = isPinned(pKey);
    const pinBtnHtml = `
      <button class="btn-secondary flex items-center gap-xs" onclick="CumuApp.togglePin('${pKey}', event)" title="${pPinned ? 'Vom Dashboard abpinnen' : 'An Mediathek anpinnen'}">
        <span class="material-symbols-outlined text-[18px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span> ${pPinned ? 'Angepinnt' : 'Anpinnen'}
      </button>`;

    let offlineBtnHtml = '';
    if (songs.length && window.CumuOfflineStore) {
      const isOffline = await CumuOfflineStore.isPlaylistOffline(pl.id);
      if (isOffline) {
        offlineBtnHtml = `
          <button id="dlPlBtn_${pl.id}" class="btn-secondary flex items-center gap-xs" style="border-color:rgba(16,185,129,0.3);color:rgb(16,185,129)" onclick="CumuApp.togglePlaylistOffline('${pl.id}')" title="Offline geladen (Klick zum Entfernen)">
            <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">download_done</span> Offline
          </button>`;
      } else {
        offlineBtnHtml = `
          <button id="dlPlBtn_${pl.id}" class="btn-secondary flex items-center gap-xs" onclick="CumuApp.togglePlaylistOffline('${pl.id}')" title="Offline speichern">
            <span class="material-symbols-outlined text-[18px]">download</span> Offline speichern
          </button>`;
      }
    }

    main.innerHTML = `
      <div class="page-hero" style="background:var(--surface-soft);padding:32px 24px;border-radius:var(--radius-lg, 16px);margin-bottom:32px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
        <div style="width:160px;height:160px;flex-shrink:0">
          ${renderCoverPlaceholder('playlist', 'large')}
        </div>
        <div class="page-hero-info" style="flex:1;min-width:240px">
          <div class="mute" style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:6px">Playlist</div>
          <h1 style="font-size:36px;font-weight:800;margin:0 0 8px 0">${esc(pl.name)}</h1>
          ${pl.description ? `<p class="mute" style="margin:0 0 10px 0;font-size:15px">${esc(pl.description)}</p>` : ''}
          <p class="mute" style="margin:0 0 20px 0;font-size:14px">
            ${songs.length} Songs ${durStr ? '&middot; ' + durStr : ''}
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${songs.length ? `
              <button class="btn-primary" onclick="CumuApp.playPlaylist('${pl.id}')">
                <span class="menu-icon">${CumuIcons.get('play')}</span> Abspielen
              </button>
              <button class="btn-secondary" onclick="CumuApp.playNextPlaylist(window._currentPlaylistSongs)">
                <span class="menu-icon">${CumuIcons.get('next')}</span> Als Nächstes
              </button>
              <button class="btn-secondary" onclick="CumuApp.addToQueuePlaylist(window._currentPlaylistSongs)">
                <span class="menu-icon">${CumuIcons.get('add')}</span> Zur Warteschlange
              </button>
              ${offlineBtnHtml}
            ` : ''}
            ${pinBtnHtml}
            <button class="btn-secondary" onclick="CumuApp.openAddSongsModal('${pl.id}')">
              <span class="menu-icon">${CumuIcons.get('add')}</span> Songs suchen
            </button>
            <button class="btn-danger" onclick="CumuApp.deletePlaylist('${pl.id}')">
              <span class="menu-icon">${CumuIcons.get('trash')}</span> Löschen
            </button>
          </div>
        </div>
      </div>

      <div class="page-section">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:16px">Titelliste</h2>
        ${songs.length
          ? `<div class="song-list">${songs.map((s, i) => renderSongRow(s, i + 1)).join('')}</div>`
          : `<div class="card" style="text-align:center;padding:48px 16px;border-radius:var(--radius-lg,16px)">
              <div style="margin-bottom:12px;display:flex;justify-content:center">${renderCoverPlaceholder('playlist', 'medium')}</div>
              <h3 style="margin:0 0 6px 0">Diese Playlist ist leer</h3>
              <p class="mute caption" style="margin-bottom:20px">Füge Songs hinzu, um deine Playlist zu füllen!</p>
              <button class="btn-primary" onclick="CumuApp.openAddSongsModal('${pl.id}')">Songs suchen & hinzufügen</button>
            </div>`
        }
      </div>`;
    bindSongRows();
  }

  async function openAddSongsModal(playlistId) {
    let modal = document.getElementById('addSongsToPlaylistModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'addSongsToPlaylistModal';
      modal.className = 'fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-md';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="w-full max-w-[540px] max-h-[85vh] bg-surface-container rounded-xl shadow-2xl border border-border-subtle p-lg flex flex-col gap-md overflow-hidden">
        <div class="flex items-center justify-between pb-sm border-b border-border-subtle">
          <h2 class="font-title-lg text-title-lg text-on-surface font-bold m-0">Songs zur Playlist hinzufügen</h2>
          <button class="text-text-muted hover:text-on-surface transition-colors rounded-full p-xs hover:bg-surface-bright" onclick="document.getElementById('addSongsToPlaylistModal').style.display='none'">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="flex flex-col gap-xs mt-sm">
          <div class="relative flex items-center w-full search-input-container compact">
            <span class="material-symbols-outlined search-icon text-text-muted text-[20px]">search</span>
            <input type="search" id="modalPlSearchInput" placeholder="Titel, Künstler oder Album suchen..." autofocus class="w-full bg-surface-container-low border border-border-subtle rounded-lg pr-md py-sm font-body-lg text-body-lg text-on-surface focus:border-text-muted focus:ring-0 outline-none transition-colors" />
          </div>
        </div>
        <div id="modalPlSearchResults" class="flex-1 overflow-y-auto flex flex-col gap-sm min-h-[200px] py-xs pr-xs scrollbar-thin">
          <p class="font-body-sm text-body-sm text-text-muted text-center py-xl">Gib einen Suchbegriff ein...</p>
        </div>
        <div class="flex items-center justify-end mt-sm pt-md border-t border-border-subtle">
          <button class="px-md py-sm rounded-lg font-body-sm text-body-sm text-on-surface bg-surface-container-high hover:bg-surface-bright transition-colors active:scale-95" onclick="document.getElementById('addSongsToPlaylistModal').style.display='none'">Fertig</button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    let searchTimeout;
    const input = document.getElementById('modalPlSearchInput');
    const results = document.getElementById('modalPlSearchResults');
    if (!input || !results) return;

    input.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const q = e.target.value;
      searchTimeout = setTimeout(async () => {
        if (!q.trim()) {
          results.innerHTML = '<p class="font-body-sm text-body-sm text-text-muted text-center py-xl">Gib einen Suchbegriff ein...</p>';
          return;
        }
        const res = await CumuApi.get(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.songs?.length) {
          results.innerHTML = res.songs.map(s => `
            <div class="flex items-center justify-between p-sm border border-border-subtle rounded-lg bg-surface-container-low hover:bg-surface-bright transition-colors">
              <div class="flex-1 overflow-hidden mr-md">
                <div class="font-bold text-on-surface whitespace-nowrap overflow-hidden text-ellipsis">${esc(s.title)}</div>
                <div class="font-body-sm text-body-sm text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">${esc(s.artist_name || 'unbekannt')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
              </div>
              <button class="px-sm py-xs bg-text-muted text-on-primary rounded text-xs hover:scale-105 active:scale-95 transition-transform flex items-center gap-xs whitespace-nowrap" onclick="CumuApp.addSongToPlaylist('${playlistId}', '${s.id}', ''); renderPlaylist('${playlistId}')">
                <span class="material-symbols-outlined text-[16px]">add</span> Hinzufügen
              </button>
            </div>
          `).join('');
        } else {
          results.innerHTML = `<p class="font-body-sm text-body-sm text-text-muted text-center py-xl">Keine Songs gefunden für "${esc(q)}"</p>`;
        }
      }, 250);
    });
  }

  async function deletePlaylist(id) {
    if (!confirm('Playlist wirklich löschen?')) return;
    await CumuApi.del(`/api/playlists/${id}`);
    await loadPlaylists();
    navigate('library');
  }

  async function renderSong(songId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">Lade Details…</div></div>';
    const s = await CumuApi.get(`/api/songs/${songId}`);
    const coverSrc = s.cover ? `/stream/cover/${s.cover}` : null;

    main.innerHTML = `
      <div class="page-hero">
        ${coverSrc
          ? `<img src="${coverSrc}" class="page-hero-cover" alt="cover">`
          : `<div class="page-hero-cover" style="display:flex;align-items:center;justify-content:center;background:var(--surface-card);font-size:48px">🎵</div>`
        }
        <div class="page-hero-info">
          <div class="mute" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Song</div>
          <h1>${esc(s.title)}</h1>
          <p class="mute" style="margin-top:6px">
            ${s.artist_name ? `<a style="color:var(--ink);text-decoration:none;cursor:pointer" onclick="navigate('artist','${s.artist_id}')">${esc(s.artist_name)}</a>` : 'Unbekannter Künstler'}
            ${s.album_title ? ` &middot; <a style="color:var(--mute);text-decoration:none;cursor:pointer" onclick="navigate('album','${s.album_id}')">${esc(s.album_title)}</a>` : ''}
          </p>
          <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap">
            <button class="btn-primary" onclick="CumuApp.playSingleSong('${s.id}')">${CumuIcons.get('play')} Abspielen</button>
            <button class="btn-secondary" onclick="CumuApp.playNextById('${s.id}')">${CumuIcons.get('next')} Als Nächstes</button>
            <button class="btn-secondary" onclick="CumuApp.addToQueueById('${s.id}')">${CumuIcons.get('add')} Zur Warteschlange</button>
            <a class="btn-secondary" href="${CumuApi.downloadUrl(s.id)}" download>${CumuIcons.get('download')} Download</a>
          </div>
        </div>
      </div>
      <div class="page-section">
        <div class="card">
          <h2 style="margin-bottom:16px">Details</h2>
          <table>
            <tr><td class="mute">Dauer</td><td>${formatTime(s.duration)}</td></tr>
            ${s.genre   ? `<tr><td class="mute">Genre</td><td>${esc(s.genre)}</td></tr>` : ''}
            ${s.year    ? `<tr><td class="mute">Jahr</td><td>${s.year}</td></tr>` : ''}
            <tr><td class="mute">Wiedergaben</td><td>${s.play_count || 0}</td></tr>
            <tr><td class="mute">Format</td><td><code>${esc(s.mime_type || '—')}</code></td></tr>
          </table>
        </div>
      </div>`;
  }

  async function playSingleSong(songId) {
    const song = await CumuApi.get(`/api/songs/${songId}`);
    playSong(song);
  }

  function decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  function renderPodcastPlayer() {
    if (!currentSong) { navigate('discover'); return; }
    hideNpBar();
    let coverSrc = '';
    if (currentSong.cover) {
      coverSrc = currentSong.cover.startsWith('http') ? currentSong.cover : `/stream/cover/${currentSong.cover}`;
    }
    
    // Decode escaped HTML entities so it renders correctly instead of raw tags
    const cleanDescription = decodeHtmlEntities(currentSong.description || '');

    main.innerHTML = `
      <div class="np-container-overlay fixed inset-0 xl:left-64 ${isQueueOpen ? 'xl:right-80' : 'xl:right-0'} z-[35] bg-background flex flex-col items-center justify-center p-md overflow-y-auto">
        <div class="flex flex-col items-center w-full max-w-3xl mx-auto py-md px-md relative">
        <!-- Top Navigation Bar & 3-Dots Button -->
        <div class="flex items-center justify-between w-full mb-lg">
          <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-high-contrast flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" onclick="navigate('podcasts')" title="Zurück zu Podcasts">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="text-label-caps font-label-caps tracking-widest uppercase text-text-muted">Podcast Player</div>
          <!-- 3-Dots Info Button -->
          <button id="podcastInfoBtn" class="w-10 h-10 rounded-full bg-surface-container-low text-text-high-contrast flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" title="Folgen-Infos">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        </div>

        <!-- 1. Icon / Artwork -->
        <div class="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden bg-surface-container-low shadow-elevation-2 mb-lg flex-shrink-0 border border-border-subtle">
          ${coverSrc ? `<img src="${coverSrc}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[64px]">podcasts</span></div>`}
        </div>

        <!-- Title & Author -->
        <div class="text-center mb-lg w-full px-md">
          <h1 class="text-title-md md:text-headline-lg font-bold text-text-high-contrast truncate mb-xs">${esc(currentSong.title)}</h1>
          <h2 class="text-body-lg text-text-muted truncate">${esc(currentSong.artist || 'Podcast')}</h2>
        </div>

        <!-- 2. Slider (Progress Bar) -->
        <div class="w-full flex flex-col gap-xs mb-lg max-w-xl">
          <input type="range" id="podcastSeek" min="0" max="100" value="${activeAudio && activeAudio.duration ? (activeAudio.currentTime / activeAudio.duration) * 100 : 0}" class="cumu-seekbar rounded-full" style="--progress-percent: ${activeAudio && activeAudio.duration ? (activeAudio.currentTime / activeAudio.duration) * 100 : 0}%;" />
          <div class="flex justify-between text-body-sm font-body-sm text-text-muted font-mono mt-xs">
            <span id="podcastCurrentTime">${activeAudio ? formatTime(activeAudio.currentTime) : '0:00'}</span>
            <span id="podcastDuration">${activeAudio ? formatTime(activeAudio.duration) : '0:00'}</span>
          </div>
        </div>

        <!-- 3. Control Buttons below Slider -->
        <div class="flex items-center justify-center gap-xl mb-xl">
          <button class="w-12 h-12 rounded-full bg-surface-container-low text-text-high-contrast hover:text-primary transition-colors flex items-center justify-center hover:scale-110 active:scale-95" onclick="CumuApp.seekBy(-15)" title="15s zurück">
            <span class="material-symbols-outlined text-[28px]">replay_10</span>
          </button>

          <button class="w-16 h-16 rounded-full bg-text-high-contrast text-on-primary flex items-center justify-center shadow-elevation-2 hover:scale-105 active:scale-95 transition-transform" onclick="CumuApp.togglePlay()">
            <span class="material-symbols-outlined text-[40px] flex items-center justify-center leading-none select-none p-0 m-0" id="podcastPlayIcon" style="font-variation-settings: 'FILL' 1;">${isPlaying ? 'pause' : 'play_arrow'}</span>
          </button>

          <button class="w-12 h-12 rounded-full bg-surface-container-low text-text-high-contrast hover:text-primary transition-colors flex items-center justify-center hover:scale-110 active:scale-95" onclick="CumuApp.seekBy(15)" title="15s vor">
            <span class="material-symbols-outlined text-[28px]">forward_10</span>
          </button>
        </div>

        <!-- Episode Info Modal / Drawer (Toggled by 3-Dots Button) -->
        <div id="podcastInfoModal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-md">
          <div class="bg-background border border-border-subtle rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl p-lg">
            <div class="flex items-center justify-between border-b border-border-subtle pb-md mb-md">
              <h3 class="text-title-md font-bold text-text-high-contrast flex items-center gap-xs">
                <span class="material-symbols-outlined">info</span>
                Folgen-Informationen
              </h3>
              <button id="closePodcastInfoBtn" class="w-8 h-8 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast flex items-center justify-center">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="overflow-y-auto pr-xs podcast-description-content text-body-md text-text-muted space-y-sm">
              ${cleanDescription || '<p class="text-text-muted italic">Keine Beschreibung verfügbar.</p>'}
            </div>
          </div>
        </div>
      </div>
    </div>
    `;

    const infoBtn = document.getElementById('podcastInfoBtn');
    const infoModal = document.getElementById('podcastInfoModal');
    const closeInfoBtn = document.getElementById('closePodcastInfoBtn');

    if (infoBtn && infoModal) {
      infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
    }
    if (closeInfoBtn && infoModal) {
      closeInfoBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
    }
    if (infoModal) {
      infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) infoModal.classList.add('hidden');
      });
    }

    // Make links in description clickable and style paragraphs
    const descContent = main.querySelector('.podcast-description-content');
    if (descContent) {
      descContent.querySelectorAll('a').forEach(a => {
        a.target = '_blank';
        a.classList.add('text-primary', 'hover:underline', 'font-bold');
      });
      descContent.querySelectorAll('p').forEach(p => {
        p.style.marginBottom = '0.75em';
      });
    }

    const podcastSeek = document.getElementById('podcastSeek');
    if (podcastSeek) {
      podcastSeek.addEventListener('input', () => {
        if (activeAudio.duration) {
          activeAudio.currentTime = (podcastSeek.value / 100) * activeAudio.duration;
        }
      });
    }
  }

  // Hook into global CumuApp for Spoken Word seeks
  const seekBy = (seconds) => {
    if (activeAudio) {
      activeAudio.currentTime = Math.max(0, activeAudio.currentTime + seconds);
    }
  };

  function renderNowPlaying() {
    if (!currentSong) { navigate('discover'); return; }
    if (isSpokenWord || currentSong.isPodcast) { renderPodcastPlayer(); return; }
    hideNpBar();
    let coverSrc = '';
    if (currentSong.cover) {
      coverSrc = currentSong.cover.startsWith('http') ? currentSong.cover : `/stream/cover/${currentSong.cover}`;
    }
    const isFav = favorites.has(currentSong.id);
    const curPct = activeAudio && activeAudio.duration ? (activeAudio.currentTime / activeAudio.duration) * 100 : 0;

    let localProgress = null;
    try { localProgress = JSON.parse(localStorage.getItem('cumu_podcast_progress')); } catch (_) {}

    main.innerHTML = `
      <div class="np-container-overlay fixed inset-0 xl:left-64 ${isQueueOpen ? 'xl:right-80' : 'xl:right-0'} z-[35] bg-background flex flex-col items-center justify-center p-md overflow-y-auto">
        <div class="flex flex-col items-center w-full max-w-3xl mx-auto py-md px-md relative">
          <!-- Top Navigation Bar & Options Button -->
          <div class="flex items-center justify-between w-full mb-lg">
            <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-high-contrast flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" onclick="navigate('discover')" title="Zurück">
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <div class="text-label-caps font-label-caps tracking-widest uppercase text-text-muted flex items-center gap-xs">
              <div class="np-equalizer ${isPlaying ? 'playing' : ''}">
                <span></span><span></span><span></span><span></span>
              </div>
              <span>NOW PLAYING</span>
            </div>
            <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-high-contrast flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" onclick="CumuApp.openNowPlayingMenu(event, this)" title="Optionen">
              <span class="material-symbols-outlined">more_vert</span>
            </button>
          </div>

          <!-- 1. Icon / Artwork -->
          <div class="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden bg-surface-container-low shadow-elevation-2 mb-lg flex-shrink-0 border border-border-subtle">
            ${coverSrc
              ? `<img src="${coverSrc}" class="w-full h-full object-cover" alt="cover" />`
              : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[64px]">music_note</span></div>`
            }
          </div>

          <!-- Title & Artist / Album -->
          <div class="text-center mb-lg w-full px-md">
            <h1 class="text-title-md md:text-headline-lg font-bold text-text-high-contrast truncate mb-xs">${esc(currentSong.title)}</h1>
            <h2 class="text-body-lg text-text-muted truncate">
              ${currentSong.artist_name ? `<a class="hover:underline cursor-pointer text-text-high-contrast" onclick="navigate('artist','${currentSong.artist_id}')">${esc(currentSong.artist_name)}</a>` : 'Unbekannter Künstler'}
              ${currentSong.album_title ? ` &middot; <a class="hover:underline cursor-pointer opacity-80" onclick="navigate('album','${currentSong.album_id}')">${esc(currentSong.album_title)}</a>` : ''}
            </h2>
          </div>

          <!-- 2. Slider (Progress Bar) -->
          <div class="w-full flex flex-col gap-xs mb-lg max-w-xl">
            <input type="range" id="fullNpSeek" min="0" max="100" value="${curPct}" class="cumu-seekbar rounded-full" style="--progress-percent: ${curPct}%;" />
            <div class="flex justify-between text-body-sm font-body-sm text-text-muted font-mono mt-xs">
              <span id="fullNpCurrent">${activeAudio ? formatTime(activeAudio.currentTime) : '0:00'}</span>
              <span id="fullNpDuration">${activeAudio ? formatTime(activeAudio.duration) : '0:00'}</span>
            </div>
          </div>

          <!-- 3. Music Control Buttons below Slider -->
          <div class="flex items-center justify-center gap-md md:gap-lg mb-lg">
            <!-- Shuffle -->
            <button class="w-12 h-12 rounded-full relative flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${isShuffle ? 'np-toggle-btn active bg-text-high-contrast text-background shadow-md' : 'bg-surface-container-low text-text-muted hover:text-text-high-contrast'}" onclick="CumuApp.toggleShuffle()" title="Zufallswiedergabe ${isShuffle ? 'deaktivieren' : 'aktivieren'}">
              <span class="material-symbols-outlined text-[24px]">shuffle</span>
            </button>

            <!-- Previous Track -->
            <button class="w-12 h-12 rounded-full bg-surface-container-low text-text-high-contrast hover:text-primary transition-colors flex items-center justify-center hover:scale-110 active:scale-95" onclick="CumuApp.prevTrack()" title="Vorheriger Track">
              <span class="material-symbols-outlined text-[28px]">skip_previous</span>
            </button>

            <!-- Main Play / Pause -->
            <button id="fullNpPlayBtn" class="w-16 h-16 rounded-full bg-text-high-contrast text-on-primary flex items-center justify-center shadow-elevation-2 hover:scale-105 active:scale-95 transition-transform" onclick="CumuApp.togglePlay()" title="${isPlaying ? 'Pausieren' : 'Abspielen'}">
              <span id="fullNpPlayIcon" class="material-symbols-outlined text-[40px] flex items-center justify-center leading-none select-none p-0 m-0" style="font-variation-settings: 'FILL' 1;">${isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>

            <!-- Next Track -->
            <button class="w-12 h-12 rounded-full bg-surface-container-low text-text-high-contrast hover:text-primary transition-colors flex items-center justify-center hover:scale-110 active:scale-95" onclick="CumuApp.nextTrack()" title="Nächster Track">
              <span class="material-symbols-outlined text-[28px]">skip_next</span>
            </button>

            <!-- Repeat -->
            <button class="w-12 h-12 rounded-full relative flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${repeatMode !== 'none' ? 'np-toggle-btn active bg-text-high-contrast text-background shadow-md' : 'bg-surface-container-low text-text-muted hover:text-text-high-contrast'}" onclick="CumuApp.toggleRepeat()" title="Wiederholung: ${repeatMode}">
              <span class="material-symbols-outlined text-[24px]">${repeatMode === 'one' ? 'repeat_one' : 'repeat'}</span>
            </button>
            
            <!-- Queue Toggle Button -->
            <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast transition-colors flex items-center justify-center hover:scale-105 active:scale-95" onclick="CumuApp.toggleQueue()" title="Warteschlange anzeigen/schließen">
              <span class="material-symbols-outlined">queue_music</span>
            </button>
          </div>

          <!-- 4. Secondary Action Bar -->
          <div class="flex items-center justify-center gap-md md:gap-lg w-full max-w-xl border-t border-border-subtle pt-md">
            <!-- Favorite / Heart -->
            <button class="w-10 h-10 rounded-full bg-surface-container-low ${isFav ? 'text-primary' : 'text-text-muted'} hover:text-primary transition-colors flex items-center justify-center hover:scale-105 active:scale-95" onclick="CumuApp.toggleFavorite('${currentSong.id}')" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
              <span class="material-symbols-outlined text-[22px]" style="${isFav ? "font-variation-settings: 'FILL' 1;" : ""}">${isFav ? 'favorite' : 'favorite'}</span>
            </button>

            <!-- Queue -->
            <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast transition-colors flex items-center justify-center hover:scale-105 active:scale-95" onclick="CumuApp.showQueuePanel()" title="Warteschlange anzeigen">
              <span class="material-symbols-outlined text-[22px]">queue_music</span>
            </button>

            <!-- Add to Playlist -->
            <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast transition-colors flex items-center justify-center hover:scale-105 active:scale-95" onclick="CumuApp.openAddToPlaylistModal('${currentSong.id}')" title="Zu Playlist hinzufügen">
              <span class="material-symbols-outlined text-[22px]">playlist_add</span>
            </button>

            <!-- Download -->
            <a class="w-10 h-10 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast transition-colors flex items-center justify-center hover:scale-105 active:scale-95" href="${CumuApi.downloadUrl(currentSong.id)}" download title="Herunterladen">
              <span class="material-symbols-outlined text-[22px]">download</span>
            </a>
          </div>
        </div>
      </div>`;

    const fullSeek = document.getElementById('fullNpSeek');
    if (fullSeek) {
      fullSeek.addEventListener('input', () => {
        if (activeAudio && activeAudio.duration) {
          const val = (fullSeek.value / 100) * activeAudio.duration;
          activeAudio.currentTime = val;
          fullSeek.style.setProperty('--progress-percent', `${fullSeek.value}%`);
        }
      });
    }
  }

  function positionDropdownMenu(ctxMenu, targetEl, event) {
    if (!ctxMenu) return;
    let rect = (targetEl && targetEl.getBoundingClientRect) ? targetEl.getBoundingClientRect() : null;
    if (!rect || (!rect.width && !rect.height && !rect.left && !rect.top)) {
      if (event && (event.clientX || event.clientY)) {
        rect = { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY, width: 0, height: 0 };
      } else {
        rect = { left: window.innerWidth - 240, top: 80, right: window.innerWidth - 10, bottom: 100, width: 0, height: 0 };
      }
    }

    ctxMenu.style.position = 'fixed';
    ctxMenu.style.zIndex = '99999';
    ctxMenu.style.display = 'block';
    ctxMenu.classList.remove('hidden');

    const menuWidth = Math.max(ctxMenu.offsetWidth || 0, 220);
    const menuHeight = Math.max(ctxMenu.offsetHeight || 0, 220);

    let left = rect.right - menuWidth;
    if (left < 10) left = rect.left;
    if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;
    if (left < 10) left = 10;

    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - 10) top = rect.top - menuHeight - 4;
    if (top < 10) top = 10;

    ctxMenu.style.top = `${Math.round(top)}px`;
    ctxMenu.style.left = `${Math.round(left)}px`;
  }

  function openNowPlayingMenu(event, btnEl) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const targetEl = btnEl || (event ? event.currentTarget : null);
    if (!currentSong) return;

    const ctxMenu = document.getElementById('contextMenu');
    if (!ctxMenu) return;

    ctxMenu.innerHTML = `
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="navigate('album','${currentSong.album_id || ''}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('album')}</span> Zum Album
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="navigate('artist','${currentSong.artist_id || ''}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('artist')}</span> Zum Künstler
      </button>
      <a class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" href="${CumuApi.downloadUrl(currentSong.id)}" download onclick="CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('download')}</span> Downloaden
      </a>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playNextById('${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('next')}</span> Als Nächstes spielen
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.addToQueueById('${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('queue')}</span> Zur Warteschlange hinzufügen
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.openAddToPlaylistModal('${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('playlist')}</span> Zu Playlist hinzufügen
      </button>
    `;

    positionDropdownMenu(ctxMenu, targetEl, event);
  }

  async function openSongMenu(event, btnEl, songId) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const targetEl = btnEl || (event ? event.currentTarget : null);

    const song = await CumuApi.get(`/api/songs/${songId}`);
    if (!song) return;

    const ctxMenu = document.getElementById('contextMenu');
    if (!ctxMenu) return;

    const isPlaylistView = currentPage === 'playlist';
    const currentPlaylistId = window._lastNavParams;

    ctxMenu.innerHTML = `
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playSingleSong('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('play')}</span> Jetzt Abspielen
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playNextById('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('next')}</span> Als Nächstes spielen
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.addToQueueById('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('queue')}</span> Zur Warteschlange hinzufügen
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.openAddToPlaylistModal('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('playlist')}</span> Zu Playlist hinzufügen
      </button>
      <a class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" href="${CumuApi.downloadUrl(song.id)}" download onclick="CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('download')}</span> Downloaden
      </a>
      ${isPlaylistView && currentPlaylistId ? `
        <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-red-400 hover:bg-surface-bright hover:text-red-300 transition-colors active:scale-95" onclick="CumuApp.removeFromPlaylist('${currentPlaylistId}', '${song.id}'); CumuApp.closeContextMenu()">
          <span class="text-red-400 flex items-center justify-center w-5 h-5">${CumuIcons.get('trash')}</span> Aus Playlist entfernen
        </button>
      ` : ''}
    `;

    positionDropdownMenu(ctxMenu, targetEl, event);
  }

  function closeContextMenu() {
    const ctxMenu = document.getElementById('contextMenu');
    if (ctxMenu) {
      ctxMenu.style.display = 'none';
      ctxMenu.classList.add('hidden');
    }
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#contextMenu') && !e.target.closest('.song-menu-btn') && !e.target.closest('.np-menu-btn')) {
      closeContextMenu();
    }
  });

  async function openAddToPlaylistModal(songId) {
    await loadPlaylists();
    const song = await CumuApi.get(`/api/songs/${songId}`);
    
    let modal = document.getElementById('addToPlaylistModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'addToPlaylistModal';
      modal.className = 'fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-md';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="w-full max-w-[440px] bg-surface-container rounded-xl shadow-2xl border border-border-subtle p-lg flex flex-col gap-md">
        <div class="flex flex-col pb-sm border-b border-border-subtle">
          <h2 class="font-title-lg text-title-lg text-on-surface font-bold m-0">Zu Playlist hinzufügen</h2>
          <p class="font-body-sm text-body-sm text-text-muted mt-xs truncate">"${esc(song?.title || 'Song')}" zu...</p>
        </div>
        <div class="flex flex-col gap-sm max-h-[50vh] overflow-y-auto py-xs scrollbar-thin">
          ${playlists.length ? playlists.map(p => `
            <button class="flex items-center gap-md w-full p-sm text-left font-body-sm text-body-sm text-on-surface bg-surface-container-low hover:bg-surface-bright rounded-lg transition-colors active:scale-95 border border-border-subtle hover:border-text-muted" onclick="document.getElementById('addToPlaylistModal').style.display='none'; CumuApp.addSongToPlaylist('${p.id}', '${songId}', '${esc(p.name)}')">
              <span class="material-symbols-outlined text-text-muted text-[20px]">queue_music</span> <span class="truncate">${esc(p.name)}</span>
            </button>
          `).join('') : '<p class="font-body-sm text-body-sm text-text-muted text-center py-md">Keine Playlists vorhanden.</p>'}
        </div>
        <div class="flex items-center justify-between mt-sm pt-md border-t border-border-subtle">
          <button class="flex items-center justify-center gap-xs px-md py-sm rounded-lg font-body-sm text-body-sm bg-text-muted text-on-primary hover:scale-105 active:scale-95 transition-transform" onclick="document.getElementById('addToPlaylistModal').style.display='none'; CumuApp.createPlaylist('${songId}')">
            <span class="material-symbols-outlined text-[18px]">add</span> Neue Playlist
          </button>
          <button class="px-md py-sm rounded-lg font-body-sm text-body-sm text-text-muted hover:text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="document.getElementById('addToPlaylistModal').style.display='none'">
            Abbrechen
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  async function addSongToPlaylist(playlistId, songId, playlistName) {
    await CumuApi.post(`/api/playlists/${playlistId}/songs`, { songId });
    const modal = document.getElementById('addToPlaylistModal');
    if (modal) modal.style.display = 'none';
    showToast(`Zu "${playlistName || 'Playlist'}" hinzugefügt`);
    if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
      renderPlaylist(playlistId);
    }
  }

  async function removeFromPlaylist(playlistId, songId) {
    await CumuApi.del(`/api/playlists/${playlistId}/songs/${songId}`);
    showToast('Aus Playlist entfernt');
    renderPlaylist(playlistId);
  }

  function renderSettings() {
    if (window.initSettingsPage) window.initSettingsPage();
  }

  function renderAdmin() {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('discover'); return; }
    main.innerHTML = CumuAdmin.renderLayout();
    CumuAdmin.switchTab('upload');
  }

  async function togglePlaylistOffline(playlistId) {
    if (!window.CumuOfflineStore) {
      showToast('Offline-Speicher nicht verfügbar');
      return;
    }
    const isOffline = await CumuOfflineStore.isPlaylistOffline(playlistId);
    const btn = document.getElementById(`dlPlBtn_${playlistId}`);

    if (isOffline) {
      await CumuOfflineStore.removePlaylistOffline(playlistId);
      showToast('Playlist aus Offline-Speicher entfernt');
      if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
        renderPlaylist(playlistId);
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Vorbereiten...`;
    }

    try {
      const pl = await CumuApi.get(`/api/playlists/${playlistId}`);
      const songs = pl.songs || [];
      if (!songs.length) {
        showToast('Playlist hat keine Songs');
        if (btn) renderPlaylist(playlistId);
        return;
      }

      await CumuOfflineStore.savePlaylistOffline(pl, songs, (current, total, title) => {
        const b = document.getElementById(`dlPlBtn_${playlistId}`);
        if (b) {
          b.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> ${current}/${total}`;
        }
      });

      showToast(`Playlist "${pl.name}" offline gespeichert (${songs.length} Songs)`);
    } catch (err) {
      console.error('[cumu] offline download failed:', err);
      showToast('Fehler beim Herunterladen der Playlist');
    }

    if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
      renderPlaylist(playlistId);
    }
  }

  window.addEventListener('online', () => {
    showToast('Internetverbindung wiederhergestellt');
  });
  window.addEventListener('offline', () => {
    showToast('Du bist offline. Nur heruntergeladene Playlists verfügbar.');
  });

  // ── Public Export ──────────────────────────────────────────────────────────

  async function playArtist(artistId) {
    const artist = await CumuApi.get(`/api/artists/${artistId}`);
    if (artist.songs?.length) playQueue(artist.songs, 0);
  }

  async function playPlaylist(playlistId) {
    const pl = await CumuApi.get(`/api/playlists/${playlistId}`);
    if (pl.songs?.length) playQueue(pl.songs, 0);
  }

  // ── Global Drag & Drop Handler ─────────────────────────────────────────────

  const AUDIO_EXTS_SET = new Set(['.mp3', '.m4a', '.aac', '.alac', '.flac', '.ogg', '.wav', '.opus']);

  function isAudioFile(filename) {
    if (!filename) return false;
    const idx = filename.lastIndexOf('.');
    if (idx === -1) return false;
    const ext = filename.substring(idx).toLowerCase();
    return AUDIO_EXTS_SET.has(ext);
  }

  async function getFilesFromEntry(entry) {
    let files = [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          if (isAudioFile(file.name)) resolve([file]);
          else resolve([]);
        }, () => resolve([]));
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await new Promise((resolve) => {
        dirReader.readEntries((results) => resolve(results || []), () => resolve([]));
      });
      for (const childEntry of entries) {
        const childFiles = await getFilesFromEntry(childEntry);
        files = files.concat(childFiles);
      }
    }
    return files;
  }

  async function collectFilesFromDrop(dataTransfer) {
    let files = [];
    if (dataTransfer.items && dataTransfer.items.length) {
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            const subFiles = await getFilesFromEntry(entry);
            files = files.concat(subFiles);
            continue;
          }
        }
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && isAudioFile(file.name)) files.push(file);
        }
      }
    } else if (dataTransfer.files && dataTransfer.files.length) {
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (isAudioFile(file.name)) files.push(file);
      }
    }
    return files;
  }

  function setupGlobalDragAndDrop() {
    const overlay = document.getElementById('dragDropOverlay');
    const toast = document.getElementById('uploadToast');
    const toastTitle = document.getElementById('uploadToastTitle');
    const toastStatus = document.getElementById('uploadToastStatus');
    const toastSpinner = document.getElementById('uploadToastSpinner');

    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (overlay) overlay.classList.remove('hidden');
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (overlay) overlay.classList.add('hidden');
      }
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (overlay) overlay.classList.add('hidden');

      const files = await collectFilesFromDrop(e.dataTransfer);
      if (!files.length) {
        showToast('Keine unterstützten Audiodateien in den abgelegten Dateien gefunden.');
        return;
      }

      if (toast) {
        toast.classList.remove('hidden');
        toastTitle.textContent = `Upload läuft (${files.length} Datei(en))...`;
        toastStatus.textContent = 'Extrahiere Metadata & importiere...';
        if (toastSpinner) toastSpinner.classList.add('animate-spin');
      }

      const batchSize = 100;
      let totalUploaded = 0;
      let failed = 0;

      for (let i = 0; i < files.length; i += batchSize) {
        const chunk = files.slice(i, i + batchSize);
        const formData = new FormData();
        chunk.forEach(f => formData.append('files', f));

        try {
          const res = await CumuApi.postForm('/api/upload', formData);
          if (res.success) {
            totalUploaded += res.uploaded || chunk.length;
          } else {
            failed += chunk.length;
          }
        } catch (err) {
          failed += chunk.length;
        }
      }

      if (toast) {
        toastTitle.textContent = totalUploaded > 0 ? '✅ Import abgeschlossen' : '❌ Import fehlgeschlagen';
        toastStatus.textContent = `${totalUploaded} Song(s) zur Mediathek hinzugefügt.`;
        if (toastSpinner) toastSpinner.classList.remove('animate-spin');
        setTimeout(() => toast.classList.add('hidden'), 5000);
      }

      showToast(`✅ ${totalUploaded} Song(s) erfolgreich importiert!`);

      if (currentPage === 'library' || currentPage === 'discover' || currentPage === 'songs') {
        navigate(currentPage, window._lastNavParams);
      }
    });
  }

  window.CumuApp = {
    getPinnedKeys,
    getPinnedCardsData,
    isPinned,
    togglePin,
    setRightSidebarTab,
    openPodcast,
    playPodcastEpisode,
    resumePodcastEpisode,
    clearPodcastProgress,
    seekBy,
    init,
    togglePlay,
    stopAudio,
    nextTrack,
    prevTrack,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    toggleMute,
    toggleFavorite,
    playAlbum,
    playArtist,
    playPlaylist,
    playSingleSong,
    createPlaylist,
    deletePlaylist,
    togglePlaylistOffline,
    openSongMenu,
    closeContextMenu,
    openAddToPlaylistModal,
    addSongToPlaylist,
    playNext,
    playNextById,
    addToQueue,
    addToQueueById,
    playNextPlaylist,
    addToQueuePlaylist,
    removeFromQueue,
    clearQueue,
    removeFromPlaylist,
    openAddSongsModal,
    openNowPlayingMenu,
    showQueuePanel,
    toggleQueue,
    jumpToQueueIndex,
  };

  window.CumuAudioEngine = {
    setCrossfade: (seconds) => { crossfadeDuration = seconds; },
    setGapless: (enabled) => { gaplessEnabled = enabled; },
  };

  document.addEventListener('DOMContentLoaded', init);
})();
