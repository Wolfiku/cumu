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

function formatTotalDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0 Min.';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h} Std.${m > 0 ? ` ${m} Min.` : ''}`;
  } else if (m > 0) {
    return `${m} Min.`;
  } else {
    return `${s} Sek.`;
  }
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
  let currentTheme      = 'standard';
  let serverVersion     = 0;
  let isShuffle         = false;
  let repeatMode        = 'none'; // 'none' | 'all' | 'one'
  let isMuted           = false;
  let savedVolume       = 1.0;
  let favorites         = new Set(JSON.parse(localStorage.getItem('cumu_favorites') || '[]'));

  // ── Pinned Items Management (Playlists Only) ────────────────────────────────
  let rightSidebarTab = 'pinned'; // 'pinned' | 'queue'

  const PIN_KEYS = {
    PODCASTS: 'podcasts',
    FAVORITES: 'favorites',
    playlist: (id) => `playlist:${id}`
  };

  function getPinnedKeys() {
    const raw = localStorage.getItem('cumu_pinned_items');
    if (raw === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(k => typeof k === 'string' && (k.startsWith('playlist:') || k === 'podcasts' || k === 'favorites')) : [];
    } catch (_) {
      return [];
    }
  }

  function isPinned(key) {
    return getPinnedKeys().includes(key);
  }

  function getPinnedCardsData() {
    const pinnedKeys = getPinnedKeys();
    const cards = [];
    for (const key of pinnedKeys) {
      if (typeof key === 'string' && key.startsWith('playlist:')) {
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
      } else if (key === 'podcasts' && currentUser?.enablePodcasts !== false) {
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
      } else if (key === 'favorites') {
        cards.push({
          key,
          title: 'Favorite Songs',
          subtitle: `${favorites.size} songs`,
          typeLabel: 'Kategorie',
          icon: 'favorite',
          onClick: "navigate('favorites')",
          bgClass: 'bg-error-container/30 text-error',
          iconColor: 'text-error'
        });
      }
    }
    return cards;
  }

  // ── Navigation & Menu Visibility Preferences ──────────────────────────────
  function getShowFavorites() {
    return localStorage.getItem('cumu_show_favorites') !== 'false';
  }

  function setShowFavorites(show) {
    localStorage.setItem('cumu_show_favorites', show ? 'true' : 'false');
    updateNavigation();
    syncPush();
  }

  function getShowPodcasts() {
    return localStorage.getItem('cumu_show_podcasts') !== 'false';
  }

  function setShowPodcasts(show) {
    localStorage.setItem('cumu_show_podcasts', show ? 'true' : 'false');
    updateNavigation();
    syncPush();
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
    }
    localStorage.setItem('cumu_pinned_items', JSON.stringify(keys));
    syncPush();

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
    currentTheme = 'standard';
    document.documentElement.setAttribute('data-theme', 'standard');
    localStorage.setItem('cumu_theme', 'standard');
    CumuIcons.setTheme('standard');
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

    // Initialize System MediaSession API, Keyboard Shortcuts & Output Device
    initMediaSession();
    initKeyboardShortcuts();
    setAudioOutputDevice(currentAudioDeviceId);

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
    const showFav = getShowFavorites();
    const showPod = getShowPodcasts() && currentUser?.enablePodcasts !== false;

    const navFav = document.getElementById('navItem-favorites');
    if (navFav) navFav.classList.toggle('hidden', !showFav);

    const navPod = document.getElementById('navItem-podcasts');
    if (navPod) navPod.classList.toggle('hidden', !showPod);

    if (currentPage === 'library') renderLibrary();
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

    applyTheme(currentUser.theme || 'standard');
    updateNavigation();

    CumuApi.connectWs();
    CumuApi.onWsMessage(handleWsMessage);

    await syncRestore();
    await loadPlaylists();
    updateLeftNavPinned();
    updateQueueUI();
    navigate('discover');
  }

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmitBtn');
    errEl.classList.add('hidden');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const originalBtnContent = submitBtn ? submitBtn.innerHTML : 'Login &rarr;';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Verbinde...';
    }

    try {
      const res = await CumuApi.login(username, password);
      currentUser = { username: res.username, role: res.role, theme: res.theme, enablePodcasts: res.enablePodcasts };
      onLoginSuccess();
    } catch (err) {
      const msg = err.message || 'Login fehlgeschlagen';
      errEl.textContent = msg.includes('fetch') || msg.includes('NetworkError')
        ? 'Server unreachable. Please make sure the backend server is running.'
        : msg;
      errEl.classList.remove('hidden');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
      }
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
          if (state.extraSettings.showFavorites !== undefined) {
            localStorage.setItem('cumu_show_favorites', state.extraSettings.showFavorites ? 'true' : 'false');
          }
          if (state.extraSettings.showPodcasts !== undefined) {
            localStorage.setItem('cumu_show_podcasts', state.extraSettings.showPodcasts ? 'true' : 'false');
          }
          updateNavigation();
          updateLeftNavPinned();
        }
      }
    } catch (_) {}
  }

  async function syncPush(updates = {}, isRetry = false) {
    try {
      const res = await CumuApi.post('/api/sync', {
        volume: activeAudio.volume,
        lastSongId: currentSong ? currentSong.id : null,
        lastPosition: activeAudio.currentTime || 0,
        theme: currentTheme,
        clientVersion: serverVersion,
        extraSettings: {
          crossfadeDuration,
          gaplessEnabled,
          pinnedItems: getPinnedKeys(),
          showFavorites: getShowFavorites(),
          showPodcasts: getShowPodcasts(),
        },
        ...updates,
      });

      if (res.conflict) {
        serverVersion = res.serverState.version;
        if (res.serverState.theme) applyTheme(res.serverState.theme);
        if (!isRetry) {
          await syncPush(updates, true);
        }
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
        if (Array.isArray(s.extraSettings.pinnedItems)) {
          localStorage.setItem('cumu_pinned_items', JSON.stringify(s.extraSettings.pinnedItems));
          updateLeftNavPinned();
        }
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
    else if (page === 'genre')          renderGenre(params);
    else if (page === 'genrePlaylist')  renderGenrePlaylist(params);
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
          showToast('Press Play to start playback');
        } else {
          showToast('Playback error (network or file format)');
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
    showToast('Continue listening reset');
    
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

  // ── MediaSession API & Audio Output Device (setSinkId) Integration ─────────

  let currentAudioDeviceId = localStorage.getItem('cumu_audio_output_device') || 'default';

  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const actions = [
      ['play', () => { if (!isPlaying) togglePlay(); }],
      ['pause', () => { if (isPlaying) togglePlay(); }],
      ['previoustrack', () => prevTrack()],
      ['nexttrack', () => nextTrack()],
      ['stop', () => {
        if (activeAudio) { activeAudio.pause(); isPlaying = false; updatePlayerUI(); }
      }],
      ['seekto', (details) => {
        if (details.fastSeek && 'fastSeek' in activeAudio) {
          activeAudio.fastSeek(details.seekTime);
        } else if (details.seekTime !== undefined) {
          activeAudio.currentTime = details.seekTime;
        }
      }],
      ['seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        if (activeAudio) {
          activeAudio.currentTime = Math.max(activeAudio.currentTime - skip, 0);
          updateMediaSessionPosition();
          showToast(`- ${skip}s`);
        }
      }],
      ['seekforward', (details) => {
        const skip = details.seekOffset || 10;
        if (activeAudio && activeAudio.duration) {
          activeAudio.currentTime = Math.min(activeAudio.currentTime + skip, activeAudio.duration);
          updateMediaSessionPosition();
          showToast(`+ ${skip}s`);
        }
      }],
    ];

    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {
        // Ignore unsupported action in browser
      }
    }
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    if (!currentSong) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const title = currentSong.title || 'Untitled';
    const artist = currentSong.artist_name || 'Unknown Artist';
    const album = currentSong.album_name || currentSong.show_title || 'cumu';
    
    let artwork = [];
    if (currentSong.cover) {
      const coverUrl = new URL(`/stream/cover/${currentSong.cover}`, window.location.origin).href;
      artwork = [
        { src: coverUrl, sizes: '96x96', type: 'image/png' },
        { src: coverUrl, sizes: '128x128', type: 'image/png' },
        { src: coverUrl, sizes: '192x192', type: 'image/png' },
        { src: coverUrl, sizes: '256x256', type: 'image/png' },
        { src: coverUrl, sizes: '512x512', type: 'image/png' },
      ];
    } else {
      const defaultIcon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f3f3f4"/></svg>';
      artwork = [{ src: defaultIcon, sizes: '96x96', type: 'image/svg+xml' }];
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        album: album,
        artwork: artwork,
      });
    } catch (e) {
      console.warn('[cumu] mediaSession metadata error:', e);
    }

    updateMediaSessionPosition();
  }

  function updateMediaSessionPosition() {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    if (!activeAudio || !activeAudio.duration || isNaN(activeAudio.duration) || activeAudio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: activeAudio.duration,
        playbackRate: activeAudio.playbackRate || 1.0,
        position: Math.min(activeAudio.currentTime || 0, activeAudio.duration),
      });
    } catch (e) {
      // Ignored during buffering
    }
  }

  async function setAudioOutputDevice(deviceId) {
    currentAudioDeviceId = deviceId || 'default';
    localStorage.setItem('cumu_audio_output_device', currentAudioDeviceId);

    const elements = [audioA, audioB, audioPodcast];
    let success = true;
    for (const el of elements) {
      if (typeof el.setSinkId === 'function') {
        try {
          await el.setSinkId(currentAudioDeviceId);
        } catch (err) {
          console.warn('[cumu] Error setting sinkId:', err);
          success = false;
        }
      }
    }
    return success;
  }

  async function getAudioOutputDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return { supported: false, devices: [] };
    }
    const hasSetSinkId = typeof HTMLMediaElement.prototype.setSinkId === 'function';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      return { supported: hasSetSinkId, devices: audioOutputs };
    } catch (err) {
      console.warn('[cumu] Error enumerating audio devices:', err);
      return { supported: hasSetSinkId, devices: [] };
    }
  }

  // ── Global Keyboard & Media Key Shortcuts ─────────────────────────────────

  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept shortcuts when user is typing in form controls
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const loginModal = document.getElementById('loginModal');
      if (loginModal && !loginModal.classList.contains('hidden')) return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          if (activeAudio) {
            const skip = e.shiftKey ? 10 : 5;
            activeAudio.currentTime = Math.max(activeAudio.currentTime - skip, 0);
            updateMediaSessionPosition();
            showToast(`- ${skip}s`);
          }
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          if (activeAudio && activeAudio.duration) {
            const skip = e.shiftKey ? 10 : 5;
            activeAudio.currentTime = Math.min(activeAudio.currentTime + skip, activeAudio.duration);
            updateMediaSessionPosition();
            showToast(`+ ${skip}s`);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min((activeAudio ? activeAudio.volume : 1) + 0.05, 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max((activeAudio ? activeAudio.volume : 1) - 0.05, 0));
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'MediaPlayPause':
          e.preventDefault();
          togglePlay();
          break;
        case 'MediaTrackPrevious':
          e.preventDefault();
          prevTrack();
          break;
        case 'MediaTrackNext':
          e.preventDefault();
          nextTrack();
          break;
      }
    });
  }
  if (npSeek) {
    npSeek.addEventListener('input', () => {
      if (activeAudio.duration) {
        activeAudio.currentTime = (npSeek.value / 100) * activeAudio.duration;
      }
    });
  }

  function toggleShuffle() {
    isShuffle = !isShuffle;
    showToast(isShuffle ? 'Shuffle enabled' : 'Shuffle disabled');
    updatePlayerUI();
  }

  function toggleRepeat() {
    if (repeatMode === 'none') repeatMode = 'all';
    else if (repeatMode === 'all') repeatMode = 'one';
    else repeatMode = 'none';

    const modeLabels = { none: 'Repeat off', all: 'Repeat all', one: 'Repeat track' };
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
      showToast('Removed from favorites');
    } else {
      favorites.add(songId);
      showToast('Added to favorites');
    }
    localStorage.setItem('cumu_favorites', JSON.stringify(Array.from(favorites)));
    updatePlayerUI();
  }

  function updatePlayerUI() {
    if (!currentSong) return;
    showNpBar();
    window._currentSongId = currentSong.id;
    updateMediaSession();

    const coverSrc = currentSong.cover ? `/stream/cover/${currentSong.cover}` : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f3f3f4"/></svg>';
    const npCover = document.getElementById('npCover');
    if (npCover) npCover.src = coverSrc;

    const npTitle = document.getElementById('npTitle');
    if (npTitle) npTitle.textContent = currentSong.title || 'Untitled';

    const npArtist = document.getElementById('npArtist');
    if (npArtist) npArtist.textContent = (currentSong.artist_name || 'Unknown Artist').toLowerCase();

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

    // Update active icon states on playlist page if currently rendered
    if (currentPage === 'playlist' && window._lastNavParams) {
      const currentPlId = window._lastNavParams;
      const plPlayBtn = document.getElementById(`plPlayBtn_${currentPlId}`);
      if (plPlayBtn) {
        const isThisPlPlaying = isPlaying && currentSong && window._currentPlaylistSongs && window._currentPlaylistSongs.some(s => s.id === currentSong.id);
        plPlayBtn.innerHTML = `<span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">${isThisPlPlaying ? 'pause' : 'play_arrow'}</span>`;
        plPlayBtn.title = isThisPlPlaying ? 'Pause' : 'Play playlist';
        plPlayBtn.onclick = () => {
          if (isThisPlPlaying) {
            togglePlay();
          } else {
            playPlaylist(currentPlId);
          }
        };
        if (isThisPlPlaying) {
          plPlayBtn.classList.add('ring-4', 'ring-primary/30');
        } else {
          plPlayBtn.classList.remove('ring-4', 'ring-primary/30');
        }
      }

      const plShuffleBtn = document.getElementById(`plShuffleBtn_${currentPlId}`);
      if (plShuffleBtn) {
        if (isShuffle) {
          plShuffleBtn.className = 'w-10 h-10 rounded-full bg-primary/20 text-primary border-primary/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border shadow-sm cursor-pointer';
          plShuffleBtn.title = 'Disable shuffle';
        } else {
          plShuffleBtn.className = 'w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border border-border-subtle shadow-sm cursor-pointer';
          plShuffleBtn.title = 'Enable shuffle';
        }
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
      showToast(`"${song.title}" will play next`);
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
      showToast(`"${song.title}" added to queue`);
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
      showToast(`${playlistSongs.length} songs added to play next`);
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

    updateQueueUI();
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

    let listHTML = '';
    if (!queue.length) {
      listHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-text-muted gap-sm">
          <span class="material-symbols-outlined text-[48px] opacity-40">queue_music</span>
          <p class="text-body-md font-medium">No tracks in queue</p>
        </div>`;
    } else {
      queue.forEach((song, i) => {
        const isCurrent = (i === queueIndex);
        const coverSrc  = song.cover ? (song.cover.startsWith('http') ? song.cover : `/stream/cover/${song.cover}`) : null;
        
        if (i === 0 && queueIndex > 0) {
          listHTML += `<div class="text-[11px] font-bold uppercase tracking-wider text-text-muted px-xs pt-xs pb-1">Past tracks</div>`;
        } else if (isCurrent) {
          listHTML += `<div class="text-[11px] font-bold uppercase tracking-wider text-primary px-xs pt-xs pb-1 flex items-center gap-xs"><span class="material-symbols-outlined text-[14px]">play_circle</span> Now playing</div>`;
        } else if (i === queueIndex + 1) {
          listHTML += `<div class="text-[11px] font-bold uppercase tracking-wider text-text-muted px-xs pt-md pb-1">Next in queue</div>`;
        }

        listHTML += `
          <div
            class="queue-drag-item group flex items-center gap-md w-full p-xs rounded-xl transition-all duration-200 ${isCurrent ? 'bg-primary/10 border border-primary/30 shadow-sm active cursor-default' : 'hover:bg-surface-container-low border border-transparent cursor-grab'}"
            draggable="${isCurrent ? 'false' : 'true'}"
            data-index="${i}"
          >
            ${isCurrent
              ? `<span class="material-symbols-outlined text-primary text-[20px] select-none p-xs" title="Currently playing">volume_up</span>`
              : `<span class="material-symbols-outlined text-text-muted text-[20px] cursor-grab select-none opacity-40 group-hover:opacity-100" title="Drag to reorder">drag_indicator</span>`
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
                ${esc(song.artist_name || song.artist || 'Unknown artist')}
              </div>
            </div>

            ${!isCurrent ? `
              <button class="w-8 h-8 rounded-full text-text-muted hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors flex-shrink-0" onclick="CumuApp.removeFromQueue(${i})" title="Remove">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            ` : `<div class="w-8 h-8 flex-shrink-0"></div>`}
          </div>`;
      });
    }

    containerEl.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between p-md border-b border-border-subtle bg-surface-container-lowest flex-shrink-0">
        <div class="flex items-center gap-xs">
          <span class="material-symbols-outlined text-primary text-[24px]">queue_music</span>
          <h2 class="text-title-md font-bold text-text-high-contrast">Queue</h2>
          <span class="text-body-sm text-text-muted font-mono">(${queue.length})</span>
        </div>
        <div class="flex items-center gap-xs">
          ${queue.length > 1 ? `<button class="text-body-sm font-bold text-text-muted hover:text-red-500 px-sm py-xs rounded-lg hover:bg-surface-container-low transition-colors" onclick="CumuApp.clearQueue()">Clear</button>` : ''}
          <button class="w-9 h-9 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast flex items-center justify-center transition-colors hover:scale-105 active:scale-95" onclick="CumuApp.toggleQueue()" title="Close">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      <!-- Scrollable List -->
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
      <div role="dialog" aria-modal="true" aria-label="Queue" class="queue-drawer-container pointer-events-auto relative w-full max-w-md h-full bg-background border-l border-border-subtle shadow-2xl flex flex-col z-10 animate-slide-in-right">
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
      updateLeftNavPinned();
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

  function renderArtistAvatarPlaceholder(name = 'Artist', size = 'large') {
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
          <div class="text-body-sm font-body-sm text-text-muted truncate mt-xs">${esc(s.artist_name || 'Unknown artist')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
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
      <div class="w-full">
        <!-- Search Header: starts in normal flow, sticks on scroll -->
        <header id="discoverSearchHeader" class="sticky top-0 z-40 w-full -mx-gutter md:-mx-margin-desktop px-gutter md:px-margin-desktop bg-background/90 backdrop-blur-xl border-b border-border-subtle/0 transition-all duration-300 pt-xs pb-sm mb-lg">
          <div class="max-w-4xl mx-auto relative flex items-center w-full search-input-container">
            <span class="material-symbols-outlined search-icon text-text-muted text-[24px] absolute left-4 pointer-events-none">search</span>
            <input id="searchInput" class="w-full h-11 pl-12 pr-lg bg-surface-container-low/90 border border-border-subtle rounded-full text-body-lg font-medium placeholder:text-text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm transition-all text-on-surface" placeholder="Search artists, songs, or podcasts" type="text" autofocus>
          </div>
        </header>

        <!-- Discovery Content -->
        <div class="max-w-[1280px] mx-auto space-y-xl">
          <div id="searchResults"></div>
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
          html += `<h2 class="text-title-md font-title-md font-bold mb-md">Albums</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-md mb-xl">${res.albums.map(renderAlbumCard).join('')}</div>`;
        }
        if (res.artists?.length) {
          html += `
            <h2 class="text-title-md font-title-md font-bold mb-md">Artists</h2>
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
                  <div class="w-full aspect-square rounded-xl overflow-hidden bg-surface-container shadow-sm flex items-center justify-center text-text-muted relative">
                    ${getPlaylistCoverHtml(pl, 'medium')}
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
        if (!html) html = `<p class="text-body-lg text-text-muted py-xl text-center">No results for "${esc(q)}"</p>`;
        container.innerHTML = html;
        bindSongRows();
        bindPodcastCards(container);
      }, 300);
    });

    // Scroll listener: show border on search header only when sticky (scrolled away from top)
    const _discoverScrollFn = () => {
      const hdr = document.getElementById('discoverSearchHeader');
      if (!hdr) { main.removeEventListener('scroll', _discoverScrollFn); return; }
      if (main.scrollTop > 8) {
        hdr.classList.add('border-border-subtle');
        hdr.classList.remove('border-border-subtle/0');
      } else {
        hdr.classList.remove('border-border-subtle');
        hdr.classList.add('border-border-subtle/0');
      }
    };
    main.addEventListener('scroll', _discoverScrollFn, { passive: true });

    renderBrowseGrid();
  }

  function getGenreStyle(genreName) {
    const normName = (genreName || '').toLowerCase().trim();
    const config = window._genreConfig || {};
    let info = config[normName];
    if (!info && config) {
      info = Object.values(config).find(v => v.name && v.name.toLowerCase().trim() === normName);
    }
    if (!info && config) {
      for (const [k, v] of Object.entries(config)) {
        if (normName.includes(k) || k.includes(normName)) {
          info = v;
          break;
        }
      }
    }

    const hex = info?.color || '#5A5B6B';
    let isLight = false;
    try {
      const cleanHex = hex.replace('#', '');
      const num = parseInt(cleanHex, 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      isLight = brightness > 165;
    } catch (_) {}

    return {
      hex,
      textColor: isLight ? 'text-slate-950 font-black' : 'text-white font-black',
      subtextColor: isLight ? 'text-slate-900/90 font-semibold' : 'text-white/90 font-medium',
      borderColor: isLight ? 'border-slate-950/20' : 'border-white/20',
      btnBg: isLight ? 'bg-slate-950 text-white' : 'bg-white text-slate-950',
      description: info?.description || ''
    };
  }

  window._discoverSectionState = window._discoverSectionState || { showAllNew: false, showAllRecent: false };
  window.toggleDiscoverSection = function(section) {
    if (!window._discoverSectionState) window._discoverSectionState = { showAllNew: false, showAllRecent: false };
    if (section === 'newSongs') window._discoverSectionState.showAllNew = !window._discoverSectionState.showAllNew;
    if (section === 'recentlyPlayed') window._discoverSectionState.showAllRecent = !window._discoverSectionState.showAllRecent;
    renderBrowseGrid();
  };

  async function renderBrowseGrid() {
    const container = document.getElementById('searchResults');
    if (!container) return;
    
    container.innerHTML = `<div class="flex items-center justify-center py-xl">
      <span class="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
    </div>`;

    let homeData = { newSongs: [], recentlyPlayed: [], mostPlayed: [] };
    let stats = null;

    try { homeData = await CumuApi.get('/api/home'); } catch (e) { console.error(e); }
    try { stats = await CumuApi.get('/api/genres/stats'); } catch (e) { console.error(e); }
    try { window._genreConfig = await CumuApi.get('/api/genres/config'); } catch (e) { console.error(e); }

    if (!document.getElementById('searchResults')) return;

    let html = '';
    const allPageSongs = [];
    const discoverState = window._discoverSectionState || { showAllNew: false, showAllRecent: false };

    // 1. Neu hinzugefügte Songs (5 Songs standardmäßig im 5-Spalten-Grid, Mehr anzeigen Button)
    if (homeData.newSongs && homeData.newSongs.length > 0) {
      const showAll = discoverState.showAllNew;
      const displaySongs = showAll ? homeData.newSongs : homeData.newSongs.slice(0, 5);
      allPageSongs.push(...displaySongs);
      const hasMore = homeData.newSongs.length > 5;
      html += `
        <section class="mb-xl">
          <div class="flex items-center justify-between mb-md">
            <div>
              <h2 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg font-bold text-text-high-contrast flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary text-[28px]">auto_awesome</span> Recently Added Songs
              </h2>
              <p class="text-body-sm text-text-muted mt-xs">Recently added to your library</p>
            </div>
            ${hasMore ? `
              <button onclick="toggleDiscoverSection('newSongs')" class="text-body-sm font-bold text-primary hover:text-interactive-hover flex items-center gap-xs cursor-pointer transition-colors bg-surface-container-low/60 hover:bg-surface-container-low px-md py-xs rounded-full">
                ${showAll ? 'Show less <span class="material-symbols-outlined text-[18px]">expand_less</span>' : 'Show more <span class="material-symbols-outlined text-[18px]">expand_more</span>'}
              </button>
            ` : ''}
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-md">
            ${displaySongs.map(renderSongCard).join('')}
          </div>
        </section>
      `;
    }

    // 2. Zuletzt gehört (5 Songs standardmäßig im 5-Spalten-Grid, Mehr anzeigen Button)
    if (homeData.recentlyPlayed && homeData.recentlyPlayed.length > 0) {
      const showAll = discoverState.showAllRecent;
      const displaySongs = showAll ? homeData.recentlyPlayed : homeData.recentlyPlayed.slice(0, 5);
      allPageSongs.push(...displaySongs);
      const hasMore = homeData.recentlyPlayed.length > 5;
      html += `
        <section class="mb-xl">
          <div class="flex items-center justify-between mb-md">
            <div>
              <h2 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg font-bold text-text-high-contrast flex items-center gap-xs">
                <span class="material-symbols-outlined text-secondary text-[28px]">history</span> Recently Played
              </h2>
            </div>
            ${hasMore ? `
              <button onclick="toggleDiscoverSection('recentlyPlayed')" class="text-body-sm font-bold text-primary hover:text-interactive-hover flex items-center gap-xs cursor-pointer transition-colors bg-surface-container-low/60 hover:bg-surface-container-low px-md py-xs rounded-full">
                ${showAll ? 'Show less <span class="material-symbols-outlined text-[18px]">expand_less</span>' : 'Show more <span class="material-symbols-outlined text-[18px]">expand_more</span>'}
              </button>
            ` : ''}
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-md">
            ${displaySongs.map(renderSongCard).join('')}
          </div>
        </section>
      `;
    }

    window._currentPageSongs = allPageSongs;

    // 3. Genres & Stöbern (Exakte 100 Hex-Farben & Universaldesign OHNE Icons)
    if (stats && stats.topGenres && stats.topGenres.length > 0) {
      html += `
        <section class="mb-xl">
          <h2 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg font-bold mb-lg flex items-center gap-xs">
            <span class="material-symbols-outlined text-tertiary text-[28px]">library_music</span> Browse & Genres
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-md md:gap-gutter">
      `;

      stats.topGenres.forEach((g, idx) => {
        const style = getGenreStyle(g.genre);
        const desc = (typeof GENRE_DESCRIPTIONS !== 'undefined' && GENRE_DESCRIPTIONS[g.genre]) || '';
        const artistLabel = g.topArtist ? esc(g.topArtist) : (g.count ? g.count + ' Songs' : 'Entdecken');
        if (idx === 0) {
          html += `
            <a class="col-span-2 row-span-2 rounded-2xl p-lg relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 shadow-xl flex flex-col justify-between min-h-[220px]" style="background-color: ${style.hex};" href="#" onclick="navigate('genre','${esc(g.genre)}'); return false;">
              <div class="relative z-10">
                <span class="text-label-caps ${style.subtextColor} uppercase tracking-wider">Top Genre</span>
                <h3 class="text-headline-md font-headline-md ${style.textColor} mt-xs drop-shadow-sm">${esc(g.genre)}</h3>
                ${desc ? `<p class="text-body-sm ${style.subtextColor} mt-sm" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;max-height:calc(1.45em * 3);">${esc(desc)}</p>` : ''}
              </div>
              <div class="relative z-10 flex items-center justify-between mt-xl border-t ${style.borderColor} pt-md">
                <span class="text-body-sm ${style.subtextColor} font-medium">${artistLabel}</span>
                <span class="${style.textColor} text-body-lg group-hover:translate-x-1 transition-transform">Genre öffnen →</span>
              </div>
            </a>
          `;
        } else {
          html += `
            <a class="rounded-2xl p-md relative overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-md hover:shadow-xl flex flex-col justify-between min-h-[140px]" style="background-color: ${style.hex};" href="#" onclick="navigate('genre','${esc(g.genre)}'); return false;">
              <div class="relative z-10">
                <h3 class="text-title-md font-title-md ${style.textColor} drop-shadow-sm truncate">${esc(g.genre)}</h3>
                ${g.topArtist ? `<span class="text-body-xs ${style.subtextColor} mt-xs block truncate opacity-80">${esc(g.topArtist)}</span>` : ''}
              </div>
              <div class="relative z-10 flex items-center justify-between mt-md pt-sm border-t ${style.borderColor}">
                <span class="text-body-xs ${style.subtextColor}">${g.count ? g.count + ' Songs' : 'Entdecken'}</span>
                <span class="${style.textColor} text-body-sm group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </a>
          `;
        }
      });

      if (stats.mostPlayedGenre && !stats.topGenres.find(t => t.genre === stats.mostPlayedGenre)) {
        const style = getGenreStyle(stats.mostPlayedGenre);
        html += `
          <a class="rounded-2xl p-md relative overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-md hover:shadow-xl flex flex-col justify-between min-h-[140px]" style="background-color: ${style.hex};" href="#" onclick="navigate('genre','${esc(stats.mostPlayedGenre)}'); return false;">
            <div class="relative z-10">
              <h3 class="text-title-md font-title-md ${style.textColor} drop-shadow-sm truncate">${esc(stats.mostPlayedGenre)}</h3>
            </div>
            <div class="relative z-10 flex items-center justify-between mt-md pt-sm border-t ${style.borderColor}">
              <span class="text-body-xs ${style.subtextColor}">Your Favorite Genre</span>
              <span class="${style.textColor} text-body-sm group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </a>
        `;
      }

      if (currentUser?.enablePodcasts !== false) {
        html += `
          <a class="col-span-2 rounded-2xl p-md relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 shadow-md bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-between" href="#" onclick="navigate('podcasts'); return false;">
            <div class="relative z-10">
              <h3 class="text-title-md font-title-md text-white font-extrabold">Podcasts</h3>
              <p class="text-body-xs text-white/70 mt-xs">Shows, episodes & radio</p>
            </div>
            <span class="text-white/90 text-body-lg font-bold group-hover:translate-x-1 transition-transform">Open →</span>
          </a>
        `;
      }

      html += `</div></section>`;
    }


    if (!html) {
      html = `<div class="p-xl text-center text-text-muted">No content found. Upload music in the Admin dashboard.</div>`;
    }

    container.innerHTML = html;
    bindSongRows();
  }


  function renderSongCard(s) {
    const coverSrc = s.cover ? `/stream/cover/${s.cover}` : null;
    return `
      <div class="group relative w-full bg-surface-bright border border-border-subtle p-md rounded-xl cursor-pointer hover:bg-surface-container-low transition-all duration-200 shadow-sm hover:shadow-md song-item" data-song-id="${s.id}">
        <div class="w-full aspect-square bg-surface-container rounded-lg overflow-hidden mb-md flex items-center justify-center relative">
          ${coverSrc
            ? `<img src="${coverSrc}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${esc(s.title)}">`
            : `<div class="w-full h-full flex items-center justify-center bg-surface-container-low text-text-muted"><span class="material-symbols-outlined text-[48px]">music_note</span></div>`
          }
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
              <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
            </div>
            <button class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 song-menu-btn shadow-md z-10" onclick="event.stopPropagation(); CumuApp.openSongMenu(event, this, '${s.id}')" title="Optionen">
              <span class="material-symbols-outlined text-[20px]">more_vert</span>
            </button>
          </div>
        </div>
        <h3 class="text-title-md font-title-md text-text-high-contrast font-bold truncate group-hover:text-primary transition-colors">${esc(s.title)}</h3>
        <p class="text-body-sm text-text-muted truncate mt-xs">${esc(s.artist_name || 'Unknown Artist')}</p>
        ${s.album_title ? `<p class="text-body-xs text-text-muted/70 truncate">${esc(s.album_title)}</p>` : ''}
      </div>`;
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
        <p class="text-body-sm text-text-muted truncate mt-xs">${esc(a.artist_name || 'Unknown Artist')} ${a.year ? '(' + a.year + ')' : ''}</p>
      </div>`;
  }

  async function renderLibrary() {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Loading library…</div>';
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
            subtitle: 'Shows & episodes',
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
          title: 'Favorite Songs',
          subtitle: `${favorites.size} songs`,
          typeLabel: 'Category',
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
            <p class="text-body-sm font-body-sm text-text-muted mt-xs">Your personal music collection.</p>
          </div>
        </header>

        <!-- Playlists & Schnellzugriff Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          <!-- Playlists Section (8 cols) -->
          <section class="md:col-span-8 bg-surface-bright border border-border-subtle rounded-xl p-lg flex flex-col h-full">
            <div class="flex justify-between items-center mb-md border-b border-border-subtle pb-sm">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold">Playlists</h2>
              <div class="flex items-center gap-md">
                <button class="text-label-caps font-label-caps text-primary hover:underline font-bold uppercase text-xs" onclick="CumuApp.createPlaylist()">+ New Playlist</button>
                <a class="text-label-caps font-label-caps text-text-muted hover:text-text-high-contrast transition-colors uppercase" href="#" onclick="navigate('playlists'); return false;">Show all</a>
              </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-md flex-1">
              ${playlists.map(p => {
                const pKey = `playlist:${p.id}`;
                const pPinned = pinnedKeys.includes(pKey);
                return `
                  <div class="group relative bg-background border border-border-subtle rounded-xl p-md cursor-pointer hover:scale-[1.02] hover:border-primary/40 transition-all duration-200 flex flex-col justify-between" onclick="navigate('playlist','${p.id}')">
                    <button class="absolute top-3 right-3 w-8 h-8 rounded-full ${pPinned ? 'text-primary bg-surface-container' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-primary bg-surface-container'} flex items-center justify-center transition-all z-10 shadow-sm" onclick="CumuApp.togglePin('${pKey}', event)" title="${pPinned ? 'Unpin' : 'Pin'}">
                      <span class="material-symbols-outlined text-[18px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
                    </button>
                    <div class="aspect-square rounded-xl overflow-hidden mb-sm border border-border-subtle bg-surface-container-low flex items-center justify-center relative">
                      ${getPlaylistCoverHtml(p, 'medium')}
                    </div>
                    <div>
                      <div class="flex items-center gap-xs">
                        <h3 class="text-body-sm font-body-sm text-text-high-contrast font-medium truncate flex-1">${esc(p.name)}</h3>
                        ${pPinned ? `<span class="material-symbols-outlined text-primary text-[14px]" style="font-variation-settings: 'FILL' 1;" title="Pinned">push_pin</span>` : ''}
                      </div>
                      <p class="text-body-sm font-body-sm text-text-muted truncate">${esc((p.description || 'Playlist').replace(/\s*\[dynamic:[^\]]+\]/, ''))}</p>
                    </div>
                  </div>`;
              }).join('') || '<p class="text-body-sm text-text-muted col-span-full">No playlists available.</p>'}
            </div>
          </section>

          <!-- Schnellzugriff Section (4 cols) -->
          <section class="md:col-span-4 bg-surface-bright border border-border-subtle rounded-xl p-lg flex flex-col h-full">
            <div class="flex justify-between items-center mb-md border-b border-border-subtle pb-sm">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold">Quick Access</h2>
            </div>
            <div class="flex flex-col gap-md">
              ${getShowFavorites() ? `
                <div class="group flex items-center justify-between p-sm rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors" onclick="navigate('favorites')">
                  <div class="flex items-center gap-md">
                    <div class="w-10 h-10 rounded-lg bg-error-container/40 flex items-center justify-center text-error">
                      <span class="material-symbols-outlined text-[24px]">favorite</span>
                    </div>
                    <div>
                      <h3 class="text-body-lg font-medium text-text-high-contrast">Favorite Songs</h3>
                      <p class="text-body-sm text-text-muted">${favorites.size} songs</p>
                    </div>
                  </div>
                </div>` : ''}

              ${(getShowPodcasts() && currentUser?.enablePodcasts !== false) ? `
                <div class="group flex items-center justify-between p-sm rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors" onclick="navigate('podcasts')">
                  <div class="flex items-center gap-md">
                    <div class="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                      <span class="material-symbols-outlined text-[24px]">podcasts</span>
                    </div>
                    <div>
                      <h3 class="text-body-lg font-medium text-text-high-contrast">Podcasts</h3>
                      <p class="text-body-sm text-text-muted">Shows & episodes</p>
                    </div>
                  </div>
                </div>` : ''}

              ${(!getShowFavorites() && (!getShowPodcasts() || currentUser?.enablePodcasts === false)) ? `
                <p class="text-body-sm text-text-muted py-md">No elements enabled. Enable them in settings.</p>
              ` : ''}
            </div>
          </section>
        </div>

        <!-- Gespeicherte Songs Section -->
        <section class="bg-surface-bright border border-border-subtle rounded-xl p-lg">
          <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-md">Saved Songs</h2>
          <div class="flex flex-col gap-xs">
            ${(lib.songs || []).map((s, idx) => renderSongRow(s, idx + 1)).join('') || '<p class="text-body-sm text-text-muted">No songs available.</p>'}
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
              <span class="material-symbols-outlined text-[16px]">resume</span> Continue Listening
            </div>
            <h3 class="text-title-md font-bold text-text-high-contrast truncate">${esc(progress.episodeTitle)}</h3>
            <p class="text-body-sm text-text-muted truncate mt-[2px]">${esc(progress.podcastTitle)}</p>
          </div>

          <div class="mt-md">
            <div class="flex items-center justify-between text-body-xs text-text-muted mb-xs font-mono">
              <span>${formatTime(cur)}</span>
              <span>${remMinutes > 0 ? `Remaining approx. ${remMinutes} min.` : formatTime(dur)}</span>
            </div>
            <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>

        <div class="flex-shrink-0 self-end md:self-center">
          <button onclick='resumePodcastEpisode(${safeProgressStr})' class="flex items-center gap-xs px-lg py-md bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-hover active:scale-95 transition-all shadow-sm">
            <span class="material-symbols-outlined text-[20px]">play_arrow</span>
            Continue
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
          <div class="mb-xs">
            <h1 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg text-text-high-contrast font-bold">Podcasts</h1>
          </div>
          <p class="text-body-lg font-body-lg text-text-muted mb-md">Discover new voices, talks, and stories.</p>

          <div class="relative flex items-center w-full max-w-xl search-input-container compact">
            <span class="material-symbols-outlined search-icon text-text-muted text-[24px]">search</span>
            <input id="podcastSearchInput" class="w-full pr-md py-md bg-surface-bright border border-border-subtle rounded-lg text-body-md placeholder:text-text-muted focus:outline-none focus:border-text-high-contrast transition-colors text-text-high-contrast shadow-sm" placeholder="Search podcasts by name or topic..." type="text">
          </div>
        </header>

        <!-- Search Results (hidden when not searching) -->
        <section id="podcastSearchResultsSection" class="mb-xl hidden">
          <div class="flex items-center justify-between mb-lg">
            <h2 id="podcastSearchResultTitle" class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
              <span class="material-symbols-outlined text-primary">search</span>
              Search Results
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
                Continue Listening
              </h2>
            </div>
            <div id="podcastContinueContainer"></div>
          </section>

          <!-- 2. Oft gehört -->
          <section id="podcastFrequentlySection" class="mb-xl hidden">
            <div class="flex items-center justify-between mb-lg">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">history</span>
                Frequently Played
              </h2>
            </div>
            <div id="podcastFrequentlyGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter"></div>
          </section>

          <!-- 3. Empfohlen (Instanz-Nutzer) -->
          <section id="podcastRecommendedSection" class="mb-xl hidden">
            <div class="flex items-center justify-between mb-lg">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">groups</span>
                Recommended
                <span class="text-body-sm font-normal text-text-muted ml-xs">(Popular in your Cumu instance)</span>
              </h2>
            </div>
            <div id="podcastRecommendedGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter"></div>
          </section>

          <!-- 4. Weltweite Trends (Am Ende) -->
          <section id="podcastGlobalSection" class="mb-xl">
            <div class="flex items-center justify-between mb-lg">
              <h2 class="text-title-md font-title-md text-text-high-contrast font-bold flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">public</span>
                Global Trends
              </h2>
            </div>
            <div id="podcastGlobalGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
              <div class="col-span-full text-center text-text-muted py-xl">Loading podcasts...</div>
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
          if (searchTitle) searchTitle.textContent = `Search results for "${esc(q)}"`;
          if (searchGrid) searchGrid.innerHTML = '<div class="col-span-full text-center text-text-muted py-xl">Searching podcasts...</div>';
          try {
            const res = await CumuApi.get(`/api/podcasts/search?q=${encodeURIComponent(q)}`);
            if (res && res.success && res.podcasts && res.podcasts.length > 0) {
              searchGrid.innerHTML = res.podcasts.map(renderPodcastCard).join('');
              bindPodcastCards(searchGrid);
            } else {
              searchGrid.innerHTML = `<div class="col-span-full text-center text-text-muted py-xl">No podcasts found for "${esc(q)}".</div>`;
            }
          } catch (err) {
            console.error(err);
            if (searchGrid) searchGrid.innerHTML = '<div class="col-span-full text-center text-red-400 py-xl">Error searching podcasts.</div>';
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
            freqGrid.innerHTML = res.frequentlyListened.map(p => renderPodcastCard({ ...p, badge: 'Frequently played' })).join('');
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
            globalGrid.innerHTML = '<div class="col-span-full text-center text-text-muted py-xl">No trends found.</div>';
          }
        }
      } catch (e) {
        console.error(e);
        const globalGrid = document.getElementById('podcastGlobalGrid');
        if (globalGrid) globalGrid.innerHTML = '<div class="col-span-full text-center text-red-400 py-xl">Error loading.</div>';
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
            <p class="text-body-lg font-body-lg text-text-muted">Loading podcast...</p>
          </div>
        </header>
        <section>
          <h2 class="text-title-md font-title-md text-text-high-contrast border-b border-border-subtle pb-sm mb-md font-bold">Episodes</h2>
          <div id="podcastEpisodes" class="flex flex-col gap-xs">
            <div class="text-center text-text-muted py-xl">Loading episodes...</div>
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
        container.innerHTML = '<div class="text-center text-text-muted py-xl">No episodes found.</div>';
      }
    } catch (e) {
      console.error(e);
      document.getElementById('podcastEpisodes').innerHTML = '<div class="text-center text-red-400 py-xl">Error loading episodes.</div>';
    }
  };

  const playPodcastEpisode = (index) => {
    if (!window.currentPodcastEpisodes) return;
    playQueue(window.currentPodcastEpisodes, index, true);
    navigate('nowplaying');
  };

  function isGeneratedPlaylist(pl) {
    if (!pl) return false;
    if (pl.is_generated === 1 || pl.is_generated === true) return true;
    if (pl.description && pl.description.includes('[dynamic:')) return true;
    return false;
  }

  async function renderPlaylists() {
    await loadPlaylists();
    const pinnedKeys = getPinnedKeys();
    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
        <div class="flex items-center justify-between mb-xl flex-wrap gap-md">
          <div>
            <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold mb-xs">Playlists</h1>
            <p class="text-body-sm text-text-muted">Your personal music collections & automatically created Cumu playlists</p>
          </div>
          <div class="flex items-center gap-md flex-wrap">
            ${playlists.length > 3 ? `
              <div class="relative flex items-center w-full sm:w-64">
                <span class="material-symbols-outlined text-text-muted text-[18px] absolute left-3 pointer-events-none">search</span>
                <input type="text" id="playlistsFilterInput" placeholder="Playlists filtern..." class="w-full bg-surface-bright border border-border-subtle rounded-full pl-9 pr-md py-xs text-body-sm text-on-surface focus:border-primary outline-none transition-colors" />
              </div>
            ` : ''}
            <button class="py-md px-lg bg-text-high-contrast text-on-primary rounded-lg text-label-caps font-bold hover:bg-interactive-hover transition-all cursor-pointer" onclick="CumuApp.createPlaylist()">
              + New Playlist
            </button>
          </div>
        </div>
        ${playlists.length ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-md">
            ${playlists.map(p => {
              const pKey = `playlist:${p.id}`;
              const pPinned = pinnedKeys.includes(pKey);
              const isGen = isGeneratedPlaylist(p);
              return `
                <div class="group relative bg-surface-bright border border-border-subtle p-md rounded-lg cursor-pointer hover:bg-surface-container-low transition-all" onclick="navigate('playlist','${p.id}')">
                  <button class="absolute top-3 right-3 w-8 h-8 rounded-full ${pPinned ? 'text-primary bg-surface-container' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-primary bg-surface-container'} flex items-center justify-center transition-all z-10 shadow-sm" onclick="CumuApp.togglePin('${pKey}', event)" title="${pPinned ? 'Unpin from dashboard' : 'Pin to library'}">
                    <span class="material-symbols-outlined text-[18px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
                  </button>
                  <div class="w-full aspect-square bg-surface-container rounded-xl flex items-center justify-center text-text-muted mb-md relative overflow-hidden">
                    ${getPlaylistCoverHtml(p, 'medium')}
                    ${isGen ? `<span class="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-background/85 text-primary backdrop-blur-md border border-primary/30 shadow-sm"><span class="material-symbols-outlined text-[12px]">auto_awesome</span> Cumu</span>` : ''}
                  </div>
                  <div class="flex items-center gap-xs">
                    <h3 class="text-title-md font-title-md text-text-high-contrast font-bold truncate flex-1">${esc(p.name)}</h3>
                    ${isGen ? `<span class="material-symbols-outlined text-primary text-[15px]" title="Von Cumu automatisch erstellt">auto_awesome</span>` : ''}
                    ${pPinned ? `<span class="material-symbols-outlined text-primary text-[16px]" style="font-variation-settings: 'FILL' 1;" title="Pinned">push_pin</span>` : ''}
                  </div>
                  <p class="text-body-sm text-text-muted truncate mt-xs">${esc((p.description || (isGen ? 'Automatisch von Cumu erstellt' : 'Playlist')).replace(/\s*\[dynamic:[^\]]+\]/, ''))}</p>
                </div>`;
            }).join('')}
          </div>`
          : `<div class="p-xl bg-surface-container-low border border-border-subtle rounded-xl text-center">
              <span class="material-symbols-outlined text-[48px] text-text-muted mb-md">queue_music</span>
              <h2 class="text-title-md font-bold mb-xs">No playlists found</h2>
              <p class="text-body-sm text-text-muted mb-lg">Create your first custom playlist!</p>
              <button class="py-md px-lg bg-text-high-contrast text-on-primary rounded-lg text-label-caps font-bold hover:bg-interactive-hover transition-all" onclick="CumuApp.createPlaylist()">Create Playlist</button>
            </div>`}
      </div>`;

    const plFilter = document.getElementById('playlistsFilterInput');
    if (plFilter) {
      plFilter.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const grid = main.querySelector('.grid');
        if (grid) {
          Array.from(grid.children).forEach(card => {
            card.style.display = card.textContent.toLowerCase().includes(q) ? 'block' : 'none';
          });
        }
      });
    }
  }

  async function renderFavorites() {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Loading favorites…</div>';
    const favArray = Array.from(favorites);

    if (!favArray.length) {
      main.innerHTML = `
        <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full">
          <div class="flex items-center justify-between mb-lg">
            <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold">Favorites</h1>
          </div>
          <div class="p-xl bg-surface-container-low border border-border-subtle rounded-xl text-center">
            <span class="material-symbols-outlined text-[48px] text-text-muted mb-md">favorite</span>
            <h2 class="text-title-md font-bold mb-xs">No favorites yet</h2>
            <p class="text-body-sm text-text-muted">Click the heart icon on any song to save it here.</p>
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
          <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold">Favorites</h1>
        </div>
        <div class="flex flex-col gap-xs">
          ${songs.map((s, idx) => renderSongRow(s, idx + 1)).join('')}
        </div>
      </div>`;
    bindSongRows();
  }

  async function renderGenre(genreName) {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Loading genre…</div>';
    try {
      const data = await CumuApi.get(`/api/genres/detail/${encodeURIComponent(genreName || '')}`);
      const songs = data.songs || [];
      const topSongs = data.topSongs || [];
      const featuredArtists = data.featuredArtists || [];
      const albums = data.albums || [];

      window._currentGenreSongs = songs;
      window._genreConfig = await CumuApi.get('/api/genres/config').catch(() => ({}));
      const style = getGenreStyle(data.genre || genreName);

      let html = `
        <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full space-y-xl">
          <!-- Hero Header with Exact User Hex Color & Description -->
          <header class="p-xl rounded-2xl ${style.textColor} shadow-xl flex flex-col justify-between min-h-[180px] md:min-h-[200px] relative overflow-hidden" style="background-color: ${style.hex};">
            <div class="relative z-10 max-w-3xl mb-md">
              <span class="text-label-caps font-label-caps ${style.subtextColor} uppercase tracking-wider font-bold">Genre & Category</span>
              <h1 class="text-headline-lg font-headline-lg ${style.textColor} font-black mt-xs mb-xs drop-shadow-sm">${esc(data.genre || genreName)}</h1>
              ${style.description ? `<p class="text-body-md ${style.subtextColor} leading-relaxed mb-sm drop-shadow-sm">${esc(style.description)}</p>` : ''}
            </div>
            <div class="flex items-end justify-between w-full relative z-10 mt-auto pt-md gap-md">
              <p class="text-body-sm ${style.subtextColor} font-medium">${songs.length} ${songs.length === 1 ? 'Song' : 'Songs'} in this category</p>
              ${songs.length ? `
                <button class="py-md px-lg ${style.btnBg} rounded-xl font-bold flex items-center gap-xs transition-all shadow-lg hover:scale-105 active:scale-95 flex-shrink-0 cursor-pointer" onclick="CumuApp.playQueue(window._currentGenreSongs, 0)">
                  <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                  Play genre
                </button>
              ` : ''}
            </div>
          </header>
      `;

      if (!songs.length) {
        html += `
          <div class="p-xl bg-surface-container-low border border-border-subtle rounded-xl text-center">
            <span class="material-symbols-outlined text-[48px] text-text-muted mb-md">queue_music</span>
            <h2 class="text-title-md font-bold mb-xs">No songs in this genre</h2>
            <p class="text-body-sm text-text-muted">No tracks found in the category "${esc(genreName)}".</p>
          </div></div>`;
        main.innerHTML = html;
        return;
      }

      // Section 1: Top Songs
      if (topSongs.length > 0) {
        html += `
          <section>
            <h2 class="text-title-md font-title-md font-bold text-text-high-contrast mb-md flex items-center gap-xs">
              <span class="material-symbols-outlined text-primary">trending_up</span> Top songs in ${esc(data.genre || genreName)}
            </h2>
            <div class="flex flex-col gap-xs rounded-xl border border-border-subtle bg-surface-bright/50 p-sm">
              ${topSongs.map((s, idx) => renderSongRow(s, idx + 1)).join('')}
            </div>
          </section>
        `;
      }

      // Section 2: Vorgestellte Künstler
      if (featuredArtists.length > 0) {
        html += `
          <section>
            <h2 class="text-title-md font-title-md font-bold text-text-high-contrast mb-md flex items-center gap-xs">
              <span class="material-symbols-outlined text-secondary">person</span> Featured artists
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-md">
              ${featuredArtists.map(a => `
                <div class="group cursor-pointer flex flex-col items-center gap-xs p-md rounded-xl bg-surface-container-low hover:bg-surface-bright transition-all" onclick="navigate('artist', '${esc(a.id)}')">
                  <div class="w-20 h-20 rounded-full overflow-hidden bg-surface-container shadow-sm">
                    ${a.image ? `<img src="${a.image}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[32px]">person</span></div>`}
                  </div>
                  <span class="text-body-md font-bold text-text-high-contrast truncate mt-xs text-center">${esc(a.name)}</span>
                </div>
              `).join('')}
            </div>
          </section>
        `;
      }

      // Section 3: Alben
      if (albums.length > 0) {
        html += `
          <section>
            <h2 class="text-title-md font-title-md font-bold text-text-high-contrast mb-md flex items-center gap-xs">
              <span class="material-symbols-outlined text-tertiary">album</span> Alben in diesem Genre
            </h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-md">
              ${albums.map(renderAlbumCard).join('')}
            </div>
          </section>
        `;
      }

      // Section 4: Alle Songs Playlist
      html += `
        <section>
          <h2 class="text-title-md font-title-md font-bold text-text-high-contrast mb-md flex items-center gap-xs">
            <span class="material-symbols-outlined text-primary">queue_music</span> Alle Songs (${songs.length})
          </h2>
          <div class="flex flex-col gap-xs rounded-xl border border-border-subtle bg-surface-bright/50 p-sm">
            ${songs.map((s, idx) => renderSongRow(s, idx + 1)).join('')}
          </div>
        </section>
      `;

      // Section 5: Kuratierte 3 Genre Playlists ([Genre], Best of [Genre], Upcoming [Genre])
      await loadPlaylists();
      const libData = await CumuApi.get('/api/library').catch(() => ({ songs: [] }));
      const userFavSongs = libData.songs || [];

      window._currentGenreName = data.genre || genreName;

      // 1. [Genre] (Alle Songs)
      const plAll = {
        name: data.genre || genreName,
        desc: `Alle Songs aus dem Genre ${data.genre || genreName}`,
        songs: [...songs]
      };

      // 2. Best of [Genre] (Top Hits nach Wiedergaben)
      const bestOfTracks = [...songs].sort((a, b) => (b.play_count || 0) - (a.play_count || 0));
      const plBestOf = {
        name: `Best of ${data.genre || genreName}`,
        desc: `Die beliebtesten & meistgehörten Tracks in ${data.genre || genreName}`,
        songs: bestOfTracks
      };

      // 3. Upcoming [Genre] (Mix des Genres mit deinen Lieblings-Liedern)
      const upcomingMixed = [];
      const addedUpcomingIds = new Set();
      const maxLen = Math.max(songs.length, userFavSongs.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < songs.length && !addedUpcomingIds.has(songs[i].id)) {
          upcomingMixed.push(songs[i]);
          addedUpcomingIds.add(songs[i].id);
        }
        if (i < userFavSongs.length && !addedUpcomingIds.has(userFavSongs[i].id)) {
          upcomingMixed.push(userFavSongs[i]);
          addedUpcomingIds.add(userFavSongs[i].id);
        }
      }
      const plUpcoming = {
        name: `Upcoming: ${data.genre || genreName}`,
        desc: `Ein beliebter Mix aus ${data.genre || genreName} und deinen Lieblings-Songs`,
        songs: upcomingMixed
      };

      window._genrePlaylistsData = {
        all: plAll,
        bestOf: plBestOf,
        upcoming: plUpcoming
      };

      html += `
        <section class="mt-2xl pt-xl border-t border-border-subtle/80">
          <div class="mb-lg flex items-center justify-between">
            <div>
              <span class="text-label-caps font-label-caps text-primary uppercase tracking-wider font-bold">Kuratierte Sammlungen</span>
              <h2 class="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-text-high-contrast font-bold mt-xs flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary text-[28px]">auto_awesome</span>
                Playlists für ${esc(data.genre || genreName)}
              </h2>
              <p class="text-body-sm text-text-muted mt-xs">Klicke auf eine Playlist für die eigene Übersichtsseite & Speichermöglichkeiten.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-lg">
            ${[
              { key: 'all', data: plAll, icon: 'library_music', badge: 'Alle Songs' },
              { key: 'bestOf', data: plBestOf, icon: 'star', badge: 'Top Hits' },
              { key: 'upcoming', data: plUpcoming, icon: 'dynamic_feed', badge: 'Upcoming Mix' }
            ].map(pItem => {
              const pData = pItem.data;
              const existingPl = playlists.find(p => p.name.toLowerCase() === pData.name.toLowerCase());
              const isSaved = !!existingPl;
              const targetNav = existingPl ? `navigate('playlist','${existingPl.id}')` : `navigate('genrePlaylist','${encodeURIComponent(data.genre || genreName)}:${pItem.key}')`;
              const durSec = pData.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
              const durMin = durSec > 0 ? `${Math.floor(durSec / 60)} Min.` : '';

              return `
                <div class="group relative bg-surface-bright border border-border-subtle hover:border-primary/60 p-md rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden" onclick="${targetNav}">
                  <!-- Cover & Header Image Box -->
                  <div class="w-full aspect-square bg-surface-container-low rounded-xl mb-md relative overflow-hidden group">
                    ${renderPlaylistCoverCollage(pData.songs, pItem.icon, style.hex)}

                    <!-- Top Badge -->
                    <div class="absolute top-3 left-3 z-10">
                      <span class="text-label-caps font-label-caps px-sm py-xs rounded-full bg-black/60 backdrop-blur-md text-white font-bold shadow-md flex items-center gap-xs">
                        <span class="material-symbols-outlined text-[14px] text-primary">${pItem.icon}</span>
                        ${pItem.badge}
                      </span>
                    </div>

                    <!-- Hover Play Button Overlay -->
                    <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                      <button class="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer" onclick="event.stopPropagation(); CumuApp.playGenrePlaylist('${pItem.key}')" title="Playlist abspielen">
                        <span class="material-symbols-outlined text-[32px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                      </button>
                    </div>
                  </div>

                  <!-- Card Content Info -->
                  <div class="flex-1 flex flex-col justify-between">
                    <div>
                      <h3 class="text-title-md font-title-md text-text-high-contrast font-bold group-hover:text-primary transition-colors truncate mb-xs flex items-center justify-between">
                        <span>${esc(pData.name)}</span>
                        <span class="material-symbols-outlined text-text-muted text-[18px] opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                      </h3>
                      <p class="text-body-sm text-text-muted line-clamp-2 min-h-[2.5rem] mb-sm">${esc(pData.desc)}</p>
                    </div>

                    <div class="flex items-center justify-between pt-sm border-t border-border-subtle/60 mt-xs">
                      <span class="text-label-caps font-label-caps text-text-muted font-medium">${pData.songs.length} ${pData.songs.length === 1 ? 'Song' : 'Songs'} ${durMin ? '· ' + durMin : ''}</span>
                      <button class="py-xs px-sm rounded-lg text-body-xs font-bold flex items-center gap-xs transition-all cursor-pointer ${isSaved ? 'bg-surface-container-low text-primary border border-primary/30' : 'bg-surface-container-low text-text-high-contrast border border-border-subtle hover:bg-surface-bright active:scale-95'}" onclick="event.stopPropagation(); CumuApp.toggleSaveGenrePlaylist('${pItem.key}')" title="${isSaved ? 'Already in your library' : 'Add to library'}">
                        <span class="material-symbols-outlined text-[16px]">${isSaved ? 'bookmark_added' : 'bookmark_add'}</span>
                        <span>${isSaved ? 'In Library' : '+ Save'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>`;

      main.innerHTML = html;
      bindSongRows();
    } catch (err) {
      console.error(err);
      renderHome();
    }
  }

  function renderPlaylistCoverCollage(songs, defaultIcon = 'queue_music', hexColor = '#5A5B6B') {
    const covers = [];
    if (Array.isArray(songs)) {
      for (const s of songs) {
        if (s && s.cover && !covers.includes(s.cover)) {
          covers.push(s.cover);
          if (covers.length >= 4) break;
        }
      }
    }

    if (covers.length >= 4) {
      return `
        <div class="w-full h-full grid grid-cols-2 grid-rows-2 rounded-xl overflow-hidden shadow-sm">
          <img src="/stream/cover/${covers[0]}" class="w-full h-full object-cover" />
          <img src="/stream/cover/${covers[1]}" class="w-full h-full object-cover" />
          <img src="/stream/cover/${covers[2]}" class="w-full h-full object-cover" />
          <img src="/stream/cover/${covers[3]}" class="w-full h-full object-cover" />
        </div>`;
    } else if (covers.length > 0) {
      return `
        <div class="w-full h-full rounded-xl overflow-hidden shadow-sm relative">
          <img src="/stream/cover/${covers[0]}" class="w-full h-full object-cover" />
        </div>`;
    } else {
      return `
        <div class="w-full h-full rounded-xl flex items-center justify-center text-white shadow-inner relative overflow-hidden" style="background: linear-gradient(135deg, ${hexColor}, #1a1c1c);">
          <span class="material-symbols-outlined text-[48px] drop-shadow-md">${defaultIcon}</span>
        </div>`;
    }
  }

  function getPlaylistCoverHtml(playlist, size = 'medium') {
    if (!playlist) {
      return `<div class="w-full h-full bg-surface-container flex items-center justify-center text-text-muted rounded-xl"><span class="material-symbols-outlined text-[32px]">queue_music</span></div>`;
    }

    if (playlist.cover) {
      return `<img src="${playlist.cover}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 rounded-xl" alt="${esc(playlist.name || '')}" />`;
    }

    const songs = playlist.songs || [];
    const covers = [];
    if (Array.isArray(songs)) {
      for (const s of songs) {
        if (s && s.cover && !covers.includes(s.cover)) {
          covers.push(s.cover);
          if (covers.length >= 4) break;
        }
      }
    }

    if (covers.length >= 4) {
      return `
        <div class="w-full h-full grid grid-cols-2 grid-rows-2 rounded-xl overflow-hidden shadow-sm bg-surface-container">
          <img src="/stream/cover/${covers[0]}" class="w-full h-full object-cover" />
          <img src="/stream/cover/${covers[1]}" class="w-full h-full object-cover" />
          <img src="/stream/cover/${covers[2]}" class="w-full h-full object-cover" />
          <img src="/stream/cover/${covers[3]}" class="w-full h-full object-cover" />
        </div>`;
    }

    if (covers.length > 0) {
      return `
        <div class="w-full h-full rounded-xl overflow-hidden shadow-sm bg-surface-container">
          <img src="/stream/cover/${covers[0]}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>`;
    }

    const iconSize = size === 'large' ? 'text-[56px]' : 'text-[36px]';
    return `
      <div class="w-full h-full rounded-xl flex items-center justify-center text-white/90 shadow-inner relative overflow-hidden bg-gradient-to-br from-slate-700 via-slate-800 to-zinc-900">
        <span class="material-symbols-outlined ${iconSize} drop-shadow-md">queue_music</span>
      </div>`;
  }

  async function renderGenrePlaylist(params) {
    main.innerHTML = '<div class="p-margin-desktop text-center text-text-muted">Lade Playlist…</div>';

    let genreName = '';
    let typeKey = 'all';

    if (typeof params === 'string') {
      const parts = params.split(':');
      genreName = decodeURIComponent(parts[0] || '');
      typeKey = parts[1] || 'all';
    } else if (params && typeof params === 'object') {
      genreName = params.genre || '';
      typeKey = params.type || 'all';
    }

    if (!genreName) {
      renderHome();
      return;
    }

    try {
      const data = await CumuApi.get(`/api/genres/detail/${encodeURIComponent(genreName)}`);
      const songs = data.songs || [];
      await loadPlaylists();
      const libData = await CumuApi.get('/api/library').catch(() => ({ songs: [] }));
      const userFavSongs = libData.songs || [];
      const style = getGenreStyle(data.genre || genreName);

      window._currentGenreName = data.genre || genreName;

      let plTitle = data.genre || genreName;
      let plDesc = `Alle Songs aus dem Genre ${data.genre || genreName}`;
      let plSongs = [...songs];
      let badgeLabel = 'Alle Songs';
      let iconName = 'library_music';

      if (typeKey === 'bestOf') {
        plTitle = `Best of ${data.genre || genreName}`;
        plDesc = `Die beliebtesten & meistgehörten Tracks in ${data.genre || genreName}`;
        plSongs = [...songs].sort((a, b) => (b.play_count || 0) - (a.play_count || 0));
        badgeLabel = 'Top Hits';
        iconName = 'star';
      } else if (typeKey === 'upcoming') {
        plTitle = `Upcoming: ${data.genre || genreName}`;
        plDesc = `Ein beliebter Mix aus ${data.genre || genreName} und deinen Lieblings-Songs`;
        const upcomingMixed = [];
        const addedIds = new Set();
        const maxLen = Math.max(songs.length, userFavSongs.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < songs.length && !addedIds.has(songs[i].id)) {
            upcomingMixed.push(songs[i]);
            addedIds.add(songs[i].id);
          }
          if (i < userFavSongs.length && !addedIds.has(userFavSongs[i].id)) {
            upcomingMixed.push(userFavSongs[i]);
            addedIds.add(userFavSongs[i].id);
          }
        }
        plSongs = upcomingMixed;
        badgeLabel = 'Upcoming Mix';
        iconName = 'dynamic_feed';
      }

      window._currentPlaylistSongs = plSongs;
      window._genrePlaylistsData = window._genrePlaylistsData || {};
      window._genrePlaylistsData[typeKey] = { name: plTitle, desc: plDesc, songs: plSongs };

      const totalDur = plSongs.reduce((acc, s) => acc + (s.duration || 0), 0);
      const durStr = formatTotalDuration(totalDur);

      const existingPl = playlists.find(p => p.name.toLowerCase() === plTitle.toLowerCase());
      const isSaved = !!existingPl;
      const creator = 'cumu';
      const isThisPlPlaying = isPlaying && currentSong && plSongs.some(s => s.id === currentSong.id);

      let html = `
        <div class="p-md md:p-margin-desktop max-w-[1280px] mx-auto w-full space-y-lg">
          <!-- Navigation Back Button -->
          <div class="flex items-center gap-xs text-text-muted hover:text-text-high-contrast cursor-pointer transition-colors w-fit mb-xs" onclick="navigate('genre', '${esc(data.genre || genreName)}')">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            <span class="text-body-sm font-medium">Zurück zu ${esc(data.genre || genreName)}</span>
          </div>

          <!-- Hero Banner for Genre / Custom Playlist (Matches normal playlist design) -->
          <div class="page-hero relative bg-surface-container-low border border-border-subtle p-6 md:p-8 rounded-2xl md:rounded-3xl mb-8 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 shadow-lg overflow-hidden">
            <!-- Cover Artwork Collage -->
            <div class="w-40 h-40 md:w-48 md:h-48 flex-shrink-0 shadow-xl rounded-2xl overflow-hidden border border-border-subtle/30">
              ${renderPlaylistCoverCollage(plSongs, iconName, style.hex)}
            </div>

            <!-- Info & Controls -->
            <div class="page-hero-info flex-1 min-w-0 w-full flex flex-col justify-center">
              <div class="text-xs uppercase tracking-widest font-bold text-text-muted mb-1 flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-primary">queue_music</span>
                <span>KURATIERTE PLAYLIST</span>
              </div>

              <h1 class="text-3xl md:text-4xl font-extrabold text-text-high-contrast tracking-tight mb-2 truncate">${esc(plTitle)}</h1>
              ${plDesc ? `<p class="text-body-md text-text-muted mb-3 line-clamp-2 max-w-2xl">${esc(plDesc)}</p>` : ''}

              <!-- Playlist Details (Ersteller: cumu, Songs, Gesamtlänge) -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm font-medium text-text-muted mb-6">
                <span class="inline-flex items-center gap-1.5 text-text-high-contrast font-semibold">
                  <span class="material-symbols-outlined text-[18px] text-text-muted">person</span>
                  ${creator}
                </span>
                <span>&middot;</span>
                <span>${plSongs.length} ${plSongs.length === 1 ? 'Song' : 'Songs'}</span>
                ${totalDur > 0 ? `<span>&middot;</span><span class="font-mono text-xs">${durStr} Gesamtlänge</span>` : ''}
              </div>

              <!-- Icon Action Bar (No text labels) -->
              <div class="flex items-center gap-3 flex-wrap">
                ${plSongs.length ? `
                  <button id="genrePlPlayBtn_${typeKey}"
                          class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 shadow-md hover:shadow-primary/40 cursor-pointer ${isThisPlPlaying ? 'ring-4 ring-primary/30' : ''}"
                          onclick="CumuApp.playQueue(window._currentPlaylistSongs, 0)"
                          title="${isThisPlPlaying ? 'Pause' : 'Playlist abspielen'}">
                    <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">${isThisPlPlaying ? 'pause' : 'play_arrow'}</span>
                  </button>
                  <button id="genrePlShuffleBtn_${typeKey}"
                          class="w-10 h-10 rounded-full ${isShuffle ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-container-high hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast border-border-subtle'} flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border shadow-sm cursor-pointer"
                          onclick="CumuApp.toggleShuffle()"
                          title="${isShuffle ? 'Disable shuffle' : 'Enable shuffle'}">
                    <span class="material-symbols-outlined text-[20px]" style="${isShuffle ? "font-variation-settings: 'FILL' 1;" : ''}">shuffle</span>
                  </button>
                ` : ''}

                <button class="w-10 h-10 rounded-full ${isSaved ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-container-high hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast border-border-subtle'} flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border shadow-sm cursor-pointer"
                        onclick="CumuApp.toggleSaveGenrePlaylist('${typeKey}')"
                        title="${isSaved ? 'Saved in library' : 'Add to library'}">
                  <span class="material-symbols-outlined text-[20px]">${isSaved ? 'bookmark_added' : 'bookmark_add'}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Song Table Section -->
          <section>
            <div class="flex items-center justify-between mb-md">
              <h2 class="text-title-md font-title-md font-bold text-text-high-contrast flex items-center gap-xs">
                <span class="material-symbols-outlined text-primary">queue_music</span> Tracks (${plSongs.length})
              </h2>
            </div>
            <div class="flex flex-col gap-xs rounded-xl border border-border-subtle bg-surface-bright/50 p-sm">
              ${plSongs.length ? plSongs.map((s, idx) => renderSongRow(s, idx + 1)).join('') : '<p class="text-body-sm text-text-muted p-md text-center">Keine Tracks in dieser Playlist gefunden.</p>'}
            </div>
          </section>
        </div>
      `;

      main.innerHTML = html;
      bindSongRows();
    } catch (err) {
      console.error(err);
      renderHome();
    }
  }

  async function syncDynamicPlaylist(pl) {
    if (!pl || !pl.description) return pl;
    const match = pl.description.match(/\[dynamic:([^:]+):([^\]]+)\]/);
    if (!match) return pl;

    const genreName = match[1];
    const typeKey = match[2];

    try {
      const data = await CumuApi.get(`/api/genres/detail/${encodeURIComponent(genreName)}`);
      const songs = data.songs || [];
      const libData = await CumuApi.get('/api/library').catch(() => ({ songs: [] }));
      const userFavSongs = libData.songs || [];

      let freshSongs = [];
      if (typeKey === 'all') {
        freshSongs = [...songs];
      } else if (typeKey === 'bestOf') {
        freshSongs = [...songs].sort((a, b) => (b.play_count || 0) - (a.play_count || 0));
      } else if (typeKey === 'upcoming') {
        const addedIds = new Set();
        const maxLen = Math.max(songs.length, userFavSongs.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < songs.length && !addedIds.has(songs[i].id)) {
            freshSongs.push(songs[i]);
            addedIds.add(songs[i].id);
          }
          if (i < userFavSongs.length && !addedIds.has(userFavSongs[i].id)) {
            freshSongs.push(userFavSongs[i]);
            addedIds.add(userFavSongs[i].id);
          }
        }
      }

      if (freshSongs.length) {
        await CumuApi.post(`/api/playlists/${pl.id}/sync-songs`, { songIds: freshSongs.map(s => s.id), isSystemSync: true }).catch(() => {});
        pl.songs = freshSongs;
      }
    } catch (e) {
      console.error('Dynamic playlist sync failed:', e);
    }

    return pl;
  }

  function playGenrePlaylist(key) {
    const pl = window._genrePlaylistsData ? window._genrePlaylistsData[key] : null;
    if (pl && pl.songs && pl.songs.length) {
      playQueue(pl.songs, 0);
    }
  }

  async function toggleSaveGenrePlaylist(key) {
    const pl = window._genrePlaylistsData ? window._genrePlaylistsData[key] : null;
    if (!pl) return;
    await loadPlaylists();

    const existingPl = playlists.find(p => p.name.toLowerCase() === pl.name.toLowerCase());
    if (existingPl) {
      const pKey = `playlist:${existingPl.id}`;
      if (!isPinned(pKey)) {
        togglePin(pKey);
        showToast(`Playlist "${pl.name}" an Mediathek angepinnt!`);
      } else {
        showToast(`Playlist "${pl.name}" ist bereits in deiner Bibliothek.`);
      }
    } else {
      try {
        const genreName = window._currentGenreName || pl.name.replace(/^(Best of |Upcoming: )/, '');
        const dynamicDesc = `${pl.desc} [dynamic:${genreName}:${key}]`;
        const created = await CumuApi.post('/api/playlists', { name: pl.name, description: dynamicDesc, is_generated: 1 });
        if (created && created.id) {
          for (const s of pl.songs) {
            await CumuApi.post(`/api/playlists/${created.id}/songs`, { songId: s.id, isSystemSync: true });
          }
          const pKey = `playlist:${created.id}`;
          togglePin(pKey);
          await loadPlaylists();
          showToast(`Playlist "${pl.name}" erfolgreich erstellt & in Bibliothek gespeichert!`);
        }
      } catch (e) {
        console.error(e);
        showToast('Fehler beim Speichern der Playlist.');
      }
    }

    if (currentPage === 'genre' && window._lastNavParams) {
      renderGenre(window._lastNavParams);
    } else if (currentPage === 'library') {
      renderLibrary();
    } else if (currentPage === 'playlists') {
      renderPlaylists();
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
          <h2 class="font-title-lg text-title-lg text-on-surface font-bold m-0">Create New Playlist</h2>
          <p class="font-body-sm text-body-sm text-text-muted mt-xs">Give the playlist a name to start adding songs.</p>
        </div>
        <form id="createPlaylistForm" class="flex flex-col gap-md mt-md">
          <div class="flex flex-col gap-xs">
            <label class="font-body-sm text-body-sm text-on-surface font-medium">Playlist Name *</label>
            <input type="text" id="newPlName" required placeholder="e.g. My Favorites" autofocus class="w-full bg-surface-container-low border border-border-subtle rounded-lg px-md py-sm font-body-lg text-body-lg text-on-surface focus:border-text-muted focus:ring-0 outline-none transition-colors" />
          </div>
          <div class="flex flex-col gap-xs">
            <label class="font-body-sm text-body-sm text-text-muted">Description (optional)</label>
            <input type="text" id="newPlDesc" placeholder="e.g. Chill music for the road" class="w-full bg-surface-container-low border border-border-subtle rounded-lg px-md py-sm font-body-sm text-body-sm text-on-surface focus:border-text-muted focus:ring-0 outline-none transition-colors" />
          </div>
          <div class="flex items-center justify-end gap-sm mt-md pt-md border-t border-border-subtle">
            <button type="button" class="px-md py-sm rounded-lg font-body-sm text-body-sm text-text-muted hover:text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="document.getElementById('createPlaylistModal').style.display='none'">Cancel</button>
            <button type="submit" class="px-md py-sm rounded-lg font-body-sm text-body-sm bg-text-muted text-on-primary hover:scale-105 active:scale-95 transition-transform duration-200">Create Playlist</button>
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
    if (typeof albumId === 'string' && albumId.startsWith('edit:')) {
      return renderEditAlbum(albumId.replace('edit:', ''));
    }
    main.innerHTML = '<div class="page-section"><div class="spinner">Loading album…</div></div>';
    const album = await CumuApi.get(`/api/albums/${albumId}`);
    if (!album || album.error) {
      main.innerHTML = '<div class="page-section"><div class="card p-xl text-center">Album not found</div></div>';
      return;
    }
    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;

    const totalDur = (album.songs || []).reduce((s, t) => s + (t.duration || 0), 0);
    const dur = totalDur > 0 ? `${Math.floor(totalDur/60)} min.` : '';

    main.innerHTML = `
      <div class="page-hero" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:32px 24px;background:var(--surface-soft);border-radius:var(--radius-lg,16px);margin-bottom:32px">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:160px;height:160px;object-fit:cover;border-radius:var(--radius-md,12px);box-shadow:0 8px 24px rgba(0,0,0,0.2)" alt="cover">`
          : `<div style="width:160px;height:160px;display:flex;align-items:center;justify-content:center;background:var(--surface-card);border-radius:var(--radius-md,12px)">${CumuIcons.get('library')}</div>`
        }
        <div class="page-hero-info" style="flex:1;min-width:240px">
          <div class="mute" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Album</div>
          <h1 style="font-size:32px;font-weight:800;margin:0 0 6px 0">${esc(album.title)}</h1>
          <p class="mute" style="margin:0 0 16px 0">${esc(album.artist_name || 'Unknown Artist')}${album.year ? ' &middot; ' + album.year : ''}${dur ? ' &middot; ' + dur : ''}</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="btn-primary" onclick="CumuApp.playAlbum('${album.id}')">${CumuIcons.get('play')} Play Album</button>
            <button class="btn-secondary" onclick="CumuApp.playNextPlaylist(window._currentAlbumSongs)">${CumuIcons.get('next')} Play Next</button>
            <button class="btn-secondary" onclick="navigate('artist','${album.artist_id}')">Go to Artist</button>
            <button class="btn-secondary" onclick="navigate('album','edit:${album.id}')">${CumuIcons.get('edit')} Edit</button>
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

  async function renderEditAlbum(albumId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">Loading album editor…</div></div>';
    const album = await CumuApi.get(`/api/albums/${albumId}`);
    if (!album || album.error) {
      main.innerHTML = '<div class="page-section"><div class="card p-xl text-center">Album not found</div></div>';
      return;
    }

    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;

    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-4xl mx-auto space-y-lg">
        <div class="flex items-center justify-between pb-md border-b border-border-subtle">
          <div class="flex items-center gap-sm">
            <button class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-bright flex items-center justify-center transition-transform active:scale-95 cursor-pointer" onclick="history.back()" title="Back">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 class="text-headline-md font-bold text-text-high-contrast m-0">Edit Album</h1>
          </div>
        </div>

        <div class="bg-surface-container-low border border-border-subtle rounded-2xl p-lg shadow-lg flex flex-col md:flex-row gap-lg">
          <div class="w-36 h-36 flex-shrink-0 rounded-xl overflow-hidden bg-surface-container shadow-md border border-border-subtle/40 self-center md:self-start">
            ${coverSrc ? `<img src="${coverSrc}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[48px]">library_music</span></div>`}
          </div>

          <form id="editAlbumForm" onsubmit="CumuApp.saveAlbumEdit(event, '${album.id}'); return false;" class="flex-1 flex flex-col gap-md">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div class="flex flex-col gap-xs col-span-2">
                <label class="text-label-caps font-label-caps text-text-muted">Album Title</label>
                <input type="text" id="editAlbumTitle" value="${esc(album.title || '')}" required class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Artist</label>
                <input type="text" id="editAlbumArtist" value="${esc(album.artist_name || '')}" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Genre</label>
                <input type="text" id="editAlbumGenre" value="${esc(album.genre || '')}" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Release Year</label>
                <input type="number" id="editAlbumYear" value="${album.year || ''}" placeholder="e.g. 2024" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>
            </div>

            <div class="flex items-center justify-end gap-md mt-md pt-md border-t border-border-subtle">
              <button type="button" class="px-lg py-sm rounded-lg font-body-sm text-text-muted hover:text-on-surface hover:bg-surface-bright transition-colors cursor-pointer" onclick="history.back()">Cancel</button>
              <button type="submit" id="editAlbumSaveBtn" class="px-xl py-sm rounded-lg font-body-sm font-semibold bg-primary text-on-primary hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer flex items-center gap-xs">
                <span class="material-symbols-outlined text-[18px]">save</span> Save
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
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
    let pl = await CumuApi.get(`/api/playlists/${playlistId}`);
    if (!pl) return;
    pl = await syncDynamicPlaylist(pl);

    const isGen = isGeneratedPlaylist(pl);
    window._currentPlaylistIsGenerated = isGen;

    const songs = pl.songs || [];
    window._currentPlaylistSongs = songs;
    const totalDur = songs.reduce((acc, t) => acc + (t.duration || 0), 0);
    const durStr = formatTotalDuration(totalDur);
    const cleanDesc = (pl.description || '').replace(/\s*\[dynamic:[^\]]+\]/, '');
    const creator = isGen ? 'Cumu (Automatisch)' : (pl.owner_username || pl.creator || pl.username || 'System');

    const pKey = `playlist:${pl.id}`;
    const pPinned = isPinned(pKey);

    let isOffline = false;
    if (songs.length && window.CumuOfflineStore) {
      isOffline = await CumuOfflineStore.isPlaylistOffline(pl.id);
    }

    const isThisPlPlaying = isPlaying && currentSong && songs.some(s => s.id === currentSong.id);

    main.innerHTML = `
      <div class="page-hero relative bg-surface-container-low border border-border-subtle p-6 md:p-8 rounded-2xl md:rounded-3xl mb-8 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 shadow-lg overflow-hidden">
        <!-- 3-Dots Button Top Right for options -->
        <button id="plMenuBtn_${pl.id}" class="pl-menu-btn absolute top-4 right-4 md:top-6 md:right-6 w-10 h-10 rounded-full bg-surface-container-high/80 hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 border border-border-subtle/60 backdrop-blur-sm z-10 shadow-sm cursor-pointer"
                onclick="CumuApp.openPlaylistMenu(event, this, '${pl.id}')"
                title="Weitere Optionen">
          <span class="material-symbols-outlined text-[22px]">more_vert</span>
        </button>

        <!-- Cover Image Collage / Artwork -->
        <div class="w-40 h-40 md:w-48 md:h-48 flex-shrink-0 shadow-xl rounded-2xl overflow-hidden border border-border-subtle/30 relative">
          ${getPlaylistCoverHtml(pl, 'large')}
          ${isGen ? `<span class="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-background/90 text-primary backdrop-blur-md border border-primary/40 shadow-md"><span class="material-symbols-outlined text-[14px]">auto_awesome</span> Cumu Playlist</span>` : ''}
        </div>

        <!-- Info & Controls -->
        <div class="page-hero-info flex-1 min-w-0 w-full flex flex-col justify-center">
          <div class="text-xs uppercase tracking-widest font-bold text-text-muted mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-primary">${isGen ? 'auto_awesome' : 'queue_music'}</span>
            <span>${isGen ? 'AUTOMATISCHE CUMU PLAYLIST' : 'PLAYLIST'}</span>
          </div>

          <h1 class="text-3xl md:text-4xl font-extrabold text-text-high-contrast tracking-tight mb-2 truncate">${esc(pl.name)}</h1>
          ${cleanDesc ? `<p class="text-body-md text-text-muted mb-3 line-clamp-2 max-w-2xl">${esc(cleanDesc)}</p>` : ''}

          <!-- Playlist Details (Ersteller, Songs, Gesamtlänge) -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm font-medium text-text-muted mb-6">
            <span class="inline-flex items-center gap-1.5 text-text-high-contrast font-semibold">
              <span class="material-symbols-outlined text-[18px] ${isGen ? 'text-primary' : 'text-text-muted'}">${isGen ? 'auto_awesome' : 'person'}</span>
              ${esc(creator)}
            </span>
            <span>&middot;</span>
            <span>${songs.length} ${songs.length === 1 ? 'Song' : 'Songs'}</span>
            ${totalDur > 0 ? `<span>&middot;</span><span class="font-mono text-xs">${durStr} Gesamtlänge</span>` : ''}
            ${isGen ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-surface-container-high text-text-muted border border-border-subtle ml-1" title="Read-only Playlist"><span class="material-symbols-outlined text-[13px]">lock</span> schreibgeschützt</span>` : ''}
          </div>

          <!-- Icon Action Bar (No text labels) -->
          <div class="flex items-center gap-3 flex-wrap">
            ${songs.length ? `
              <button id="plPlayBtn_${pl.id}"
                      class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 shadow-md hover:shadow-primary/40 cursor-pointer ${isThisPlPlaying ? 'ring-4 ring-primary/30' : ''}"
                      onclick="${isThisPlPlaying ? 'CumuApp.togglePlay()' : `CumuApp.playPlaylist('${pl.id}')`}"
                      title="${isThisPlPlaying ? 'Pause' : 'Playlist abspielen'}">
                <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">${isThisPlPlaying ? 'pause' : 'play_arrow'}</span>
              </button>
              <button id="plShuffleBtn_${pl.id}"
                      class="w-10 h-10 rounded-full ${isShuffle ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-container-high hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast border-border-subtle'} flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border shadow-sm cursor-pointer"
                      onclick="CumuApp.toggleShuffle()"
                      title="${isShuffle ? 'Zufallswiedergabe deaktivieren' : 'Zufallswiedergabe aktivieren'}">
                <span class="material-symbols-outlined text-[20px]" style="${isShuffle ? "font-variation-settings: 'FILL' 1;" : ''}">shuffle</span>
              </button>
            ` : ''}

            ${!isGen ? `
              <button id="plAddSongsBtn_${pl.id}"
                      class="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border border-border-subtle shadow-sm cursor-pointer"
                      onclick="CumuApp.openAddSongsModal('${pl.id}')"
                      title="Songs suchen & hinzufügen">
                <span class="material-symbols-outlined text-[20px]">playlist_add</span>
              </button>
            ` : ''}

            ${songs.length && window.CumuOfflineStore ? `
              <button id="dlPlBtn_${pl.id}" class="w-10 h-10 rounded-full ${isOffline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-surface-container-high hover:bg-surface-bright hover:border-emerald-500/40 text-text-high-contrast border-border-subtle'} flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border shadow-sm cursor-pointer"
                      onclick="CumuApp.togglePlaylistOffline('${pl.id}')"
                      title="${isOffline ? 'Offline geladen (Klick zum Entfernen)' : 'Offline speichern'}">
                <span class="material-symbols-outlined text-[20px]" style="${isOffline ? "font-variation-settings: 'FILL' 1;" : ''}">${isOffline ? 'download_done' : 'download'}</span>
              </button>
            ` : ''}

            <button id="plPinBtn_${pl.id}"
                    class="w-10 h-10 rounded-full ${pPinned ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-container-high hover:bg-surface-bright hover:border-primary/50 text-text-high-contrast border-border-subtle'} flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border shadow-sm cursor-pointer"
                    onclick="CumuApp.togglePin('${pKey}', event)"
                    title="${pPinned ? 'Vom Dashboard abpinnen' : 'An Mediathek anpinnen'}">
              <span class="material-symbols-outlined text-[20px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span>
            </button>

            <button id="plDeleteBtn_${pl.id}"
                    class="w-10 h-10 rounded-full bg-surface-container-high hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30 text-text-muted flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 border border-border-subtle shadow-sm cursor-pointer"
                    onclick="CumuApp.deletePlaylist('${pl.id}')"
                    title="Playlist löschen">
              <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>
      </div>

      <div class="page-section">
        <div class="flex items-center justify-between mb-md flex-wrap gap-sm">
          <h2 style="font-size:22px;font-weight:700;margin:0">Tracklist (${songs.length})</h2>
          ${songs.length > 2 ? `
            <div class="relative flex items-center w-full sm:w-64">
              <span class="material-symbols-outlined text-text-muted text-[18px] absolute left-3 pointer-events-none">search</span>
              <input type="text" id="playlistTrackFilterInput" placeholder="Tracks in Playlist suchen..." class="w-full bg-surface-bright border border-border-subtle rounded-full pl-9 pr-md py-xs text-body-sm text-on-surface focus:border-primary outline-none transition-colors" />
            </div>
          ` : ''}
        </div>
        ${songs.length
          ? `<div class="song-list">${songs.map((s, i) => renderSongRow(s, i + 1)).join('')}</div>`
          : `<div class="card" style="text-align:center;padding:48px 16px;border-radius:var(--radius-lg,16px)">
              <div style="margin-bottom:12px;display:flex;justify-content:center">${renderCoverPlaceholder('playlist', 'medium')}</div>
              <h3 style="margin:0 0 6px 0">${isGen ? 'Noch keine Songs in dieser automatischen Playlist' : 'This playlist is empty'}</h3>
              <p class="mute caption" style="margin-bottom:20px">${isGen ? 'Cumu wird hier automatisch passende Songs einfügen.' : 'Add songs to fill your playlist!'}</p>
              ${!isGen ? `<button class="btn-primary" onclick="CumuApp.openAddSongsModal('${pl.id}')">Search & add songs</button>` : ''}
            </div>`
        }
      </div>`;
    bindSongRows();

    const trackFilter = document.getElementById('playlistTrackFilterInput');
    if (trackFilter) {
      trackFilter.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const rows = main.querySelectorAll('.song-list .song-item');
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(q) ? 'flex' : 'none';
        });
      });
    }
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
          <h2 class="font-title-lg text-title-lg text-on-surface font-bold m-0">Add Songs to Playlist</h2>
          <button class="text-text-muted hover:text-on-surface transition-colors rounded-full p-xs hover:bg-surface-bright cursor-pointer" onclick="document.getElementById('addSongsToPlaylistModal').style.display='none'">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="flex flex-col gap-xs mt-sm">
          <div class="relative flex items-center w-full search-input-container compact">
            <span class="material-symbols-outlined search-icon text-text-muted text-[20px]">search</span>
            <input type="search" id="modalPlSearchInput" placeholder="Search title, artist, or album..." autofocus class="w-full bg-surface-container-low border border-border-subtle rounded-lg pr-md py-sm font-body-lg text-body-lg text-on-surface focus:border-text-muted focus:ring-0 outline-none transition-colors" />
          </div>
        </div>
        <div id="modalPlSearchResults" class="flex-1 overflow-y-auto flex flex-col gap-sm min-h-[200px] py-xs pr-xs scrollbar-thin">
          <p class="font-body-sm text-body-sm text-text-muted text-center py-xl">Enter a search term...</p>
        </div>
        <div class="flex items-center justify-end mt-sm pt-md border-t border-border-subtle">
          <button class="px-md py-sm rounded-lg font-body-sm text-body-sm text-on-surface bg-surface-container-high hover:bg-surface-bright transition-colors active:scale-95 flex items-center gap-xs cursor-pointer" onclick="document.getElementById('addSongsToPlaylistModal').style.display='none'">
            <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back to playlist
          </button>
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
          results.innerHTML = '<p class="font-body-sm text-body-sm text-text-muted text-center py-xl">Enter a search term...</p>';
          return;
        }
        const res = await CumuApi.get(`/api/search?q=${encodeURIComponent(q)}`);
        const currentSongIds = new Set((window._currentPlaylistSongs || []).map(s => s.id));

        if (res.songs?.length) {
          results.innerHTML = res.songs.map(s => {
            const isAlready = currentSongIds.has(s.id);
            return `
              <div class="flex items-center justify-between p-sm border border-border-subtle rounded-lg bg-surface-container-low hover:bg-surface-bright transition-colors">
                <div class="flex-1 overflow-hidden mr-md">
                  <div class="font-bold text-on-surface whitespace-nowrap overflow-hidden text-ellipsis">${esc(s.title)}</div>
                  <div class="font-body-sm text-body-sm text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">${esc(s.artist_name || 'unknown')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
                </div>
                ${isAlready ? `
                  <button class="px-sm py-xs bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs flex items-center gap-xs whitespace-nowrap pointer-events-none opacity-90">
                    <span class="material-symbols-outlined text-[16px]">check</span> Already in Playlist
                  </button>
                ` : `
                  <button class="px-sm py-xs bg-text-muted text-on-primary rounded text-xs hover:scale-105 active:scale-95 transition-transform flex items-center gap-xs whitespace-nowrap cursor-pointer" onclick="CumuApp.handleAddSongToPlaylistFromModal(this, '${playlistId}', '${s.id}')">
                    <span class="material-symbols-outlined text-[16px]">add</span> Add
                  </button>
                `}
              </div>
            `;
          }).join('');
        } else {
          results.innerHTML = `<p class="font-body-sm text-body-sm text-text-muted text-center py-xl">No songs found for "${esc(q)}"</p>`;
        }
      }, 250);
    });
  }

  async function deletePlaylist(id) {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    await CumuApi.del(`/api/playlists/${id}`);
    await loadPlaylists();
    navigate('library');
  }

  async function renderSong(songId) {
    if (typeof songId === 'string' && songId.startsWith('edit:')) {
      return renderEditSong(songId.replace('edit:', ''));
    }
    main.innerHTML = '<div class="p-md md:p-margin-desktop flex items-center justify-center min-h-[300px]"><span class="material-symbols-outlined text-[36px] animate-spin text-primary">sync</span></div>';
    
    let s;
    try {
      s = await CumuApi.get(`/api/songs/${songId}`);
    } catch (err) {
      console.error(err);
    }

    if (!s || s.error) {
      main.innerHTML = `
        <div class="p-md md:p-margin-desktop max-w-4xl mx-auto text-center py-xl">
          <div class="bg-surface-container-low border border-border-subtle rounded-2xl p-xl shadow-lg">
            <span class="material-symbols-outlined text-[48px] text-text-muted mb-md">music_off</span>
            <h2 class="text-title-md font-bold text-text-high-contrast mb-xs">Song not found</h2>
            <p class="text-body-sm text-text-muted mb-md">The requested track could not be loaded.</p>
            <button class="px-md py-sm bg-primary text-on-primary rounded-lg font-semibold cursor-pointer" onclick="history.back()">Back</button>
          </div>
        </div>`;
      return;
    }

    const coverSrc = s.cover ? `/stream/cover/${s.cover}` : null;

    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-4xl mx-auto space-y-lg">
        <!-- Hero Section -->
        <div class="relative bg-surface-container-low border border-border-subtle p-md md:p-lg rounded-2xl md:rounded-3xl shadow-lg flex flex-col md:flex-row items-center md:items-start gap-md md:gap-lg overflow-hidden">
          <div class="w-44 h-44 md:w-52 md:h-52 flex-shrink-0 rounded-2xl overflow-hidden bg-surface-container shadow-md border border-border-subtle/50 relative">
            ${coverSrc
              ? `<img src="${coverSrc}" class="w-full h-full object-cover" alt="Cover" />`
              : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[64px]">music_note</span></div>`
            }
          </div>

          <div class="flex-1 min-w-0 w-full flex flex-col justify-center text-center md:text-left">
            <div class="text-label-caps font-label-caps tracking-widest uppercase text-text-muted mb-xs flex items-center justify-center md:justify-start gap-xs">
              <span class="material-symbols-outlined text-[16px] text-primary">audiotrack</span> Song Details
            </div>
            <h1 class="text-headline-md md:text-headline-lg font-bold text-text-high-contrast truncate mb-xs">${esc(s.title)}</h1>
            <p class="text-body-lg text-text-muted mb-md truncate">
              ${s.artist_name ? `<a class="text-text-high-contrast hover:underline cursor-pointer font-semibold" onclick="navigate('artist','${s.artist_id}')">${esc(s.artist_name)}</a>` : 'Unbekannter Künstler'}
              ${s.album_title ? ` &middot; <a class="text-text-muted hover:underline cursor-pointer" onclick="navigate('album','${s.album_id}')">${esc(s.album_title)}</a>` : ''}
            </p>

            <div class="flex items-center justify-center md:justify-start gap-sm flex-wrap">
              <button class="px-lg py-sm bg-primary text-on-primary hover:scale-105 active:scale-95 transition-all rounded-full font-semibold flex items-center gap-xs shadow-md cursor-pointer" onclick="CumuApp.playSingleSong('${s.id}')">
                <span class="material-symbols-outlined text-[20px]">play_arrow</span> Play
              </button>
              <button class="px-md py-sm bg-surface-bright border border-border-subtle hover:bg-surface-container-high text-on-surface hover:scale-105 active:scale-95 transition-all rounded-full font-semibold flex items-center gap-xs cursor-pointer" onclick="CumuApp.playNextById('${s.id}')">
                <span class="material-symbols-outlined text-[20px]">queue_music</span> Play Next
              </button>
              <button class="px-md py-sm bg-surface-bright border border-border-subtle hover:bg-surface-container-high text-on-surface hover:scale-105 active:scale-95 transition-all rounded-full font-semibold flex items-center gap-xs cursor-pointer" onclick="CumuApp.addToQueueById('${s.id}')">
                <span class="material-symbols-outlined text-[20px]">add</span> Add to Queue
              </button>
              <button class="px-md py-sm bg-surface-bright border border-border-subtle hover:bg-surface-container-high text-on-surface hover:scale-105 active:scale-95 transition-all rounded-full font-semibold flex items-center gap-xs cursor-pointer" onclick="navigate('song','edit:${s.id}')">
                <span class="material-symbols-outlined text-[20px]">edit</span> Edit
              </button>
              <a class="px-md py-sm bg-surface-bright border border-border-subtle hover:bg-surface-container-high text-on-surface hover:scale-105 active:scale-95 transition-all rounded-full font-semibold flex items-center gap-xs cursor-pointer" href="${CumuApi.downloadUrl(s.id)}" download>
                <span class="material-symbols-outlined text-[20px]">download</span> Download
              </a>
            </div>
          </div>
        </div>

        <!-- Details Card -->
        <div class="bg-surface-container-low border border-border-subtle rounded-2xl p-lg shadow-lg">
          <h2 class="text-title-md font-bold text-text-high-contrast mb-md flex items-center gap-xs">
            <span class="material-symbols-outlined text-primary">info</span> Metadata &amp; Details
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-md">
            <div class="bg-surface-container/60 border border-border-subtle/40 rounded-xl p-md flex flex-col gap-xs">
              <span class="text-label-caps font-label-caps text-text-muted uppercase">Duration</span>
              <span class="text-body-lg font-semibold text-on-surface">${formatTime(s.duration)}</span>
            </div>
            <div class="bg-surface-container/60 border border-border-subtle/40 rounded-xl p-md flex flex-col gap-xs">
              <span class="text-label-caps font-label-caps text-text-muted uppercase">Genre</span>
              <span class="text-body-lg font-semibold text-on-surface">${esc(s.genre || 'Unknown')}</span>
            </div>
            <div class="bg-surface-container/60 border border-border-subtle/40 rounded-xl p-md flex flex-col gap-xs">
              <span class="text-label-caps font-label-caps text-text-muted uppercase">Release Year</span>
              <span class="text-body-lg font-semibold text-on-surface">${s.year || 'Unknown'}</span>
            </div>
            <div class="bg-surface-container/60 border border-border-subtle/40 rounded-xl p-md flex flex-col gap-xs">
              <span class="text-label-caps font-label-caps text-text-muted uppercase">Plays</span>
              <span class="text-body-lg font-semibold text-on-surface">${s.play_count || 0} times</span>
            </div>
            <div class="bg-surface-container/60 border border-border-subtle/40 rounded-xl p-md flex flex-col gap-xs">
              <span class="text-label-caps font-label-caps text-text-muted uppercase">Audio Type</span>
              <span class="text-body-lg font-semibold text-on-surface">${s.is_audiobook ? 'Audiobook / Spoken Word' : 'Music Track'}</span>
            </div>
            <div class="bg-surface-container/60 border border-border-subtle/40 rounded-xl p-md flex flex-col gap-xs">
              <span class="text-label-caps font-label-caps text-text-muted uppercase">Format</span>
              <span class="text-body-sm font-mono text-text-muted truncate">${esc(s.mime_type || 'Audio')}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function renderEditSong(songId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">Loading song editor…</div></div>';
    const s = await CumuApi.get(`/api/songs/${songId}`);
    if (!s || s.error) {
      main.innerHTML = '<div class="page-section"><div class="card p-xl text-center">Song not found</div></div>';
      return;
    }

    const coverSrc = s.cover ? `/stream/cover/${s.cover}` : null;

    main.innerHTML = `
      <div class="p-md md:p-margin-desktop max-w-4xl mx-auto space-y-lg">
        <div class="flex items-center justify-between pb-md border-b border-border-subtle">
          <div class="flex items-center gap-sm">
            <button class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-bright flex items-center justify-center transition-transform active:scale-95 cursor-pointer" onclick="history.back()" title="Back">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 class="text-headline-md font-bold text-text-high-contrast m-0">Edit Song</h1>
          </div>
          ${currentUser?.role === 'admin' || currentUser?.role === 'creator' ? `
            <button id="editSongAiLookupBtn" class="px-md py-sm bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 rounded-lg text-body-sm font-semibold flex items-center gap-xs transition-all active:scale-95 cursor-pointer" onclick="CumuApp.lookupSongMetadata('${s.id}')">
              <span class="material-symbols-outlined text-[18px]">auto_fix_high</span> Auto-Lookup (AI)
            </button>
          ` : ''}
        </div>

        <div class="bg-surface-container-low border border-border-subtle rounded-2xl p-lg shadow-lg flex flex-col md:flex-row gap-lg">
          <div class="w-36 h-36 flex-shrink-0 rounded-xl overflow-hidden bg-surface-container shadow-md border border-border-subtle/40 self-center md:self-start">
            ${coverSrc ? `<img src="${coverSrc}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[48px]">music_note</span></div>`}
          </div>

          <form id="editSongForm" onsubmit="CumuApp.saveSongEdit(event, '${s.id}'); return false;" class="flex-1 flex flex-col gap-md">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div class="flex flex-col gap-xs col-span-2">
                <label class="text-label-caps font-label-caps text-text-muted">Title</label>
                <input type="text" id="editSongTitle" value="${esc(s.title || '')}" required class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Artist</label>
                <input type="text" id="editSongArtist" value="${esc(s.artist_name || '')}" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Album</label>
                <input type="text" id="editSongAlbum" value="${esc(s.album_title || '')}" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Genre</label>
                <input type="text" id="editSongGenre" value="${esc(s.genre || '')}" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Release Year</label>
                <input type="number" id="editSongYear" value="${s.year || ''}" placeholder="e.g. 2024" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex flex-col gap-xs">
                <label class="text-label-caps font-label-caps text-text-muted">Track Number</label>
                <input type="number" id="editSongTrackNumber" value="${s.track_number || ''}" placeholder="e.g. 1" class="bg-surface-container border border-border-subtle rounded-lg px-md py-sm text-body-md text-on-surface focus:border-primary outline-none transition-colors" />
              </div>

              <div class="flex items-center gap-sm mt-xs">
                <input type="checkbox" id="editSongAudiobook" ${s.is_audiobook ? 'checked' : ''} class="w-4 h-4 accent-primary rounded cursor-pointer" />
                <label for="editSongAudiobook" class="text-body-sm text-on-surface cursor-pointer select-none">Audiobook / Spoken Word Track</label>
              </div>
            </div>

            <div class="flex items-center justify-end gap-md mt-md pt-md border-t border-border-subtle">
              <button type="button" class="px-lg py-sm rounded-lg font-body-sm text-text-muted hover:text-on-surface hover:bg-surface-bright transition-colors cursor-pointer" onclick="history.back()">Cancel</button>
              <button type="submit" id="editSongSaveBtn" class="px-xl py-sm rounded-lg font-body-sm font-semibold bg-primary text-on-primary hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer flex items-center gap-xs">
                <span class="material-symbols-outlined text-[18px]">save</span> Save
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function saveSongEdit(e, songId) {
    if (e) e.preventDefault();
    const btn = document.getElementById('editSongSaveBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Saving…`;
    }

    const title = document.getElementById('editSongTitle')?.value;
    const artist = document.getElementById('editSongArtist')?.value;
    const album = document.getElementById('editSongAlbum')?.value;
    const genre = document.getElementById('editSongGenre')?.value;
    const year = document.getElementById('editSongYear')?.value;
    const track_number = document.getElementById('editSongTrackNumber')?.value;
    const is_audiobook = document.getElementById('editSongAudiobook')?.checked;

    try {
      const res = await CumuApi.put(`/api/songs/${songId}`, {
        title, artist, album, genre,
        year: year ? parseInt(year, 10) : null,
        track_number: track_number ? parseInt(track_number, 10) : null,
        is_audiobook
      });
      if (res && res.error) {
        showToast(`Error: ${res.error}`);
        if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Save`; }
        return;
      }
      showToast('Song saved successfully');
      navigate('song', songId);
    } catch (err) {
      showToast(`Error saving: ${err.message}`);
      if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Save`; }
    }
  }

  async function saveAlbumEdit(e, albumId) {
    if (e) e.preventDefault();
    const btn = document.getElementById('editAlbumSaveBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Saving…`;
    }

    const title = document.getElementById('editAlbumTitle')?.value;
    const artist = document.getElementById('editAlbumArtist')?.value;
    const genre = document.getElementById('editAlbumGenre')?.value;
    const year = document.getElementById('editAlbumYear')?.value;

    try {
      const res = await CumuApi.put(`/api/albums/${albumId}`, {
        title, artist, genre,
        year: year ? parseInt(year, 10) : null
      });
      if (res && res.error) {
        showToast(`Error: ${res.error}`);
        if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Save`; }
        return;
      }
      showToast('Album saved successfully');
      navigate('album', albumId);
    } catch (err) {
      showToast(`Error saving: ${err.message}`);
      if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Save`; }
    }
  }

  async function lookupSongMetadata(songId) {
    const btn = document.getElementById('editSongAiLookupBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Requesting…`;
    }
    try {
      const res = await CumuApi.post(`/admin/songs/${songId}/lookup`, {});
      if (res && res.ok) {
        showToast('Metadata updated via AI/MusicBrainz');
        renderEditSong(songId);
      } else {
        showToast(`Lookup: ${res?.reasoning || res?.error || 'No results'}`);
        if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">auto_fix_high</span> Auto-Lookup (AI)`; }
      }
    } catch (err) {
      showToast(`Lookup Error: ${err.message}`);
      if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">auto_fix_high</span> Auto-Lookup (AI)`; }
    }
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
          </div>

          <!-- 4. Secondary Action Bar -->
          <div class="flex items-center justify-center gap-md md:gap-lg w-full max-w-xl border-t border-border-subtle pt-md">
            <!-- Favorite / Heart -->
            <button class="w-10 h-10 rounded-full bg-surface-container-low ${isFav ? 'text-primary' : 'text-text-muted'} hover:text-primary transition-colors flex items-center justify-center hover:scale-105 active:scale-95" onclick="CumuApp.toggleFavorite('${currentSong.id}')" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
              <span class="material-symbols-outlined text-[22px]" style="${isFav ? "font-variation-settings: 'FILL' 1;" : ""}">${isFav ? 'favorite' : 'favorite'}</span>
            </button>

            <!-- Queue (Warteschlange) -->
            <button class="w-10 h-10 rounded-full bg-surface-container-low text-text-muted hover:text-text-high-contrast transition-colors flex items-center justify-center hover:scale-105 active:scale-95" onclick="CumuApp.toggleQueue()" title="Warteschlange umschalten">
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
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="navigate('song','edit:${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('edit')}</span> Edit Song Info
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="navigate('album','${currentSong.album_id || ''}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('album')}</span> Go to Album
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="navigate('artist','${currentSong.artist_id || ''}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('artist')}</span> Go to Artist
      </button>
      <a class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" href="${CumuApi.downloadUrl(currentSong.id)}" download onclick="CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('download')}</span> Download
      </a>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playNextById('${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('next')}</span> Play Next
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.addToQueueById('${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('queue')}</span> Add to Queue
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.openAddToPlaylistModal('${currentSong.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('playlist')}</span> Add to Playlist
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
    const isCurrentPlGen = window._currentPlaylistIsGenerated;

    ctxMenu.innerHTML = `
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playSingleSong('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('play')}</span> Play Now
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playNextById('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('next')}</span> Play Next
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.addToQueueById('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('queue')}</span> Add to Queue
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.openAddToPlaylistModal('${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('playlist')}</span> Add to Playlist
      </button>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="navigate('song','edit:${song.id}'); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('edit')}</span> Edit
      </button>
      <a class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" href="${CumuApi.downloadUrl(song.id)}" download onclick="CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('download')}</span> Download
      </a>
      ${isPlaylistView && currentPlaylistId && !isCurrentPlGen ? `
        <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-red-400 hover:bg-surface-bright hover:text-red-300 transition-colors active:scale-95" onclick="CumuApp.removeFromPlaylist('${currentPlaylistId}', '${song.id}'); CumuApp.closeContextMenu()">
          <span class="text-red-400 flex items-center justify-center w-5 h-5">${CumuIcons.get('trash')}</span> Remove from Playlist
        </button>
      ` : ''}
    `;

    positionDropdownMenu(ctxMenu, targetEl, event);
  }

  async function openPlaylistMenu(event, btnEl, playlistId) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const targetEl = btnEl || (event ? event.currentTarget : null);

    let pl = await CumuApi.get(`/api/playlists/${playlistId}`);
    if (!pl) return;
    const isGen = isGeneratedPlaylist(pl);
    const songs = pl.songs || [];
    const pKey = `playlist:${pl.id}`;
    const pPinned = isPinned(pKey);

    let isOffline = false;
    if (songs.length && window.CumuOfflineStore) {
      isOffline = await CumuOfflineStore.isPlaylistOffline(pl.id);
    }

    const ctxMenu = document.getElementById('contextMenu');
    if (!ctxMenu) return;

    ctxMenu.innerHTML = `
      ${!isGen ? `
        <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.openAddSongsModal('${pl.id}'); CumuApp.closeContextMenu()">
          <span class="text-text-muted flex items-center justify-center w-5 h-5"><span class="material-symbols-outlined text-[20px]">playlist_add</span></span> Search & add songs
        </button>
      ` : ''}
      ${songs.length ? `
        <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playPlaylist('${pl.id}'); CumuApp.closeContextMenu()">
          <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('play')}</span> Play Playlist
        </button>
        <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.playNextPlaylist(window._currentPlaylistSongs); CumuApp.closeContextMenu()">
          <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('next')}</span> Play Next
        </button>
        <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.addToQueuePlaylist(window._currentPlaylistSongs); CumuApp.closeContextMenu()">
          <span class="text-text-muted flex items-center justify-center w-5 h-5">${CumuIcons.get('queue')}</span> Add to Queue
        </button>
        ${window.CumuOfflineStore ? `
          <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.togglePlaylistOffline('${pl.id}'); CumuApp.closeContextMenu()">
            <span class="text-text-muted flex items-center justify-center w-5 h-5"><span class="material-symbols-outlined text-[20px]" style="${isOffline ? "font-variation-settings: 'FILL' 1;" : ''}">${isOffline ? 'download_done' : 'download'}</span></span> ${isOffline ? 'Remove from offline storage' : 'Save offline'}
          </button>
        ` : ''}
      ` : ''}
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="CumuApp.togglePin('${pKey}', event); CumuApp.closeContextMenu()">
        <span class="text-text-muted flex items-center justify-center w-5 h-5"><span class="material-symbols-outlined text-[20px]" style="${pPinned ? "font-variation-settings: 'FILL' 1;" : ''}">push_pin</span></span> ${pPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
      </button>
      <div class="my-xs border-t border-border-subtle"></div>
      <button class="flex items-center gap-md w-full px-md py-sm text-left font-body-sm text-body-sm text-red-400 hover:bg-surface-bright hover:text-red-300 transition-colors active:scale-95" onclick="CumuApp.deletePlaylist('${pl.id}'); CumuApp.closeContextMenu()">
        <span class="text-red-400 flex items-center justify-center w-5 h-5">${CumuIcons.get('trash')}</span> Delete Playlist
      </button>
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
    if (!e.target.closest('#contextMenu') && !e.target.closest('.song-menu-btn') && !e.target.closest('.np-menu-btn') && !e.target.closest('.pl-menu-btn')) {
      closeContextMenu();
    }
  });

  async function openAddToPlaylistModal(songId) {
    await loadPlaylists();
    const song = await CumuApi.get(`/api/songs/${songId}`);
    const availablePlaylists = playlists.filter(p => !isGeneratedPlaylist(p));
    
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
          <h2 class="font-title-lg text-title-lg text-on-surface font-bold m-0">Add to Playlist</h2>
          <p class="font-body-sm text-body-sm text-text-muted mt-xs truncate">"${esc(song?.title || 'Song')}" to...</p>
          ${availablePlaylists.length > 2 ? `
            <div class="relative flex items-center w-full mt-sm">
              <span class="material-symbols-outlined text-text-muted text-[18px] absolute left-3 pointer-events-none">search</span>
              <input type="search" id="addToPlSearchInput" placeholder="Playlists filtern..." class="w-full bg-surface-container-low border border-border-subtle rounded-lg pl-9 pr-md py-xs text-body-sm text-on-surface focus:border-primary outline-none transition-colors" />
            </div>
          ` : ''}
        </div>
        <div id="addToPlList" class="flex flex-col gap-sm max-h-[50vh] overflow-y-auto py-xs scrollbar-thin">
          ${availablePlaylists.length ? availablePlaylists.map(p => `
            <button class="flex items-center gap-md w-full p-sm text-left font-body-sm text-body-sm text-on-surface bg-surface-container-low hover:bg-surface-bright rounded-lg transition-colors active:scale-95 border border-border-subtle hover:border-text-muted cursor-pointer" onclick="CumuApp.handleAddToPlaylistClick(this, '${p.id}', '${songId}', '${esc(p.name)}')">
              <span class="material-symbols-outlined text-text-muted text-[20px]">queue_music</span> <span class="truncate">${esc(p.name)}</span>
            </button>
          `).join('') : '<p class="font-body-sm text-body-sm text-text-muted text-center py-md">Keine bearbeitbaren eigenen Playlisten vorhanden.</p>'}
        </div>
        <div class="flex items-center justify-between mt-sm pt-md border-t border-border-subtle">
          <button class="flex items-center justify-center gap-xs px-md py-sm rounded-lg font-body-sm text-body-sm bg-text-muted text-on-primary hover:scale-105 active:scale-95 transition-transform" onclick="document.getElementById('addToPlaylistModal').style.display='none'; CumuApp.createPlaylist('${songId}')">
            <span class="material-symbols-outlined text-[18px]">add</span> New Playlist
          </button>
          <button class="px-md py-sm rounded-lg font-body-sm text-body-sm text-text-muted hover:text-on-surface hover:bg-surface-bright transition-colors active:scale-95" onclick="document.getElementById('addToPlaylistModal').style.display='none'">
            Cancel
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    const addToPlSearch = document.getElementById('addToPlSearchInput');
    if (addToPlSearch) {
      addToPlSearch.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const listContainer = document.getElementById('addToPlList');
        if (listContainer) {
          const btns = listContainer.querySelectorAll('button');
          btns.forEach(b => {
            b.style.display = b.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
          });
        }
      });
    }
  }

  async function handleAddSongToPlaylistFromModal(btn, playlistId, songId) {
    if (btn) {
      btn.disabled = true;
      btn.className = 'px-sm py-xs bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs transition-all duration-200 flex items-center gap-xs whitespace-nowrap shadow-sm scale-105 pointer-events-none opacity-90';
      btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Already in Playlist';
    }
    if (window._currentPlaylistSongs && !window._currentPlaylistSongs.some(s => s.id === songId)) {
      window._currentPlaylistSongs.push({ id: songId });
    }
    await addSongToPlaylist(playlistId, songId, '');
    if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
      renderPlaylist(playlistId);
    }
  }

  async function handleAddToPlaylistClick(btn, playlistId, songId, playlistName) {
    if (btn) {
      btn.style.pointerEvents = 'none';
      btn.className = 'flex items-center gap-md w-full p-sm text-left font-body-sm text-body-sm text-emerald-400 bg-emerald-500/15 border border-emerald-500/40 rounded-lg transition-all duration-200 scale-[1.02] shadow-sm';
      btn.innerHTML = `<span class="material-symbols-outlined text-[20px] text-emerald-400">check_circle</span> <span class="truncate font-bold">${esc(playlistName)} (Added)</span>`;
    }
    await addSongToPlaylist(playlistId, songId, playlistName);
    setTimeout(() => {
      const modal = document.getElementById('addToPlaylistModal');
      if (modal) modal.style.display = 'none';
    }, 400);
  }

  async function addSongToPlaylist(playlistId, songId, playlistName) {
    await CumuApi.post(`/api/playlists/${playlistId}/songs`, { songId });
    showToast(`Added to "${playlistName || 'Playlist'}"`);
    if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
      renderPlaylist(playlistId);
    }
  }

  async function removeFromPlaylist(playlistId, songId) {
    await CumuApi.del(`/api/playlists/${playlistId}/songs/${songId}`);
    showToast('Removed from playlist');
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
      showToast('Offline storage not available');
      return;
    }
    const isOffline = await CumuOfflineStore.isPlaylistOffline(playlistId);
    const btn = document.getElementById(`dlPlBtn_${playlistId}`);

    if (isOffline) {
      await CumuOfflineStore.removePlaylistOffline(playlistId);
      showToast('Playlist removed from offline storage');
      if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
        renderPlaylist(playlistId);
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-[20px] animate-spin">sync</span>`;
      btn.title = "Downloading...";
    }

    try {
      const pl = await CumuApi.get(`/api/playlists/${playlistId}`);
      const songs = pl.songs || [];
      if (!songs.length) {
        showToast('Playlist has no songs');
        if (btn) renderPlaylist(playlistId);
        return;
      }

      await CumuOfflineStore.savePlaylistOffline(pl, songs, (current, total, title) => {
        const b = document.getElementById(`dlPlBtn_${playlistId}`);
        if (b) {
          b.innerHTML = `<span class="material-symbols-outlined text-[20px] animate-spin">sync</span>`;
          b.title = `Downloading: ${current}/${total}`;
        }
      });

      showToast(`Playlist "${pl.name}" saved offline (${songs.length} songs)`);
    } catch (err) {
      console.error('[cumu] offline download failed:', err);
      showToast('Error downloading playlist');
    }

    if (currentPage === 'playlist' && window._lastNavParams === playlistId) {
      renderPlaylist(playlistId);
    }
  }

  window.addEventListener('online', () => {
    showToast('Internet connection restored');
  });
  window.addEventListener('offline', () => {
    showToast('You are offline. Only downloaded playlists available.');
  });

  // ── Public Export ──────────────────────────────────────────────────────────

  async function playArtist(artistId) {
    const artist = await CumuApi.get(`/api/artists/${artistId}`);
    if (artist.songs?.length) playQueue(artist.songs, 0);
  }

  async function playPlaylist(playlistId) {
    let pl = await CumuApi.get(`/api/playlists/${playlistId}`);
    if (!pl) return;
    pl = await syncDynamicPlaylist(pl);
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
    getShowFavorites,
    setShowFavorites,
    getShowPodcasts,
    setShowPodcasts,
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
    openPlaylistMenu,
    openSongMenu,
    closeContextMenu,
    openAddToPlaylistModal,
    saveSongEdit,
    saveAlbumEdit,
    lookupSongMetadata,
    handleAddSongToPlaylistFromModal,
    handleAddToPlaylistClick,
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
    playQueue,
    playGenrePlaylist,
    toggleSaveGenrePlaylist,
    renderGenrePlaylist,
    renderPlaylistCoverCollage,
  };

  window.playQueue = playQueue;

  window.CumuAudioEngine = {
    setCrossfade: (seconds) => { crossfadeDuration = seconds; },
    setGapless: (enabled) => { gaplessEnabled = enabled; },
    setAudioOutputDevice: setAudioOutputDevice,
    getAudioOutputDevices: getAudioOutputDevices,
    getCurrentAudioDeviceId: () => currentAudioDeviceId,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
