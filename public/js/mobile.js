/**
 * public/js/mobile.js
 * Mobile shell for cumu: bottom tab bar (home / library / profile), mini player,
 * browser-history based back navigation, touch queue reordering and long-press
 * song menus. Everything here is only visible below the md breakpoint (768px);
 * the history integration also gives desktop browsers a working back button.
 */

'use strict';

(function () {
  const MOBILE_QUERY = window.matchMedia('(max-width: 767px)');
  const isMobile = () => MOBILE_QUERY.matches;

  // Pages that belong to a tab. Pages not listed (album, artist, song, nowplaying)
  // keep whichever tab was active when they were opened.
  const TAB_FOR_PAGE = {
    discover: 'home',
    genre: 'home',
    genrePlaylist: 'home',
    library: 'library',
    playlists: 'library',
    playlist: 'library',
    favorites: 'library',
    podcasts: 'library',
    settings: 'profile',
    admin: 'profile',
  };
  const TAB_ROOT_PAGES = ['discover', 'library', 'settings'];

  let activeTab = 'home';

  // ── History integration ────────────────────────────────────────────────────
  // Every navigate() call becomes a history entry so the Android back button,
  // iOS swipe-back and the browser back button move through the app.

  const appNavigate = window.navigate;
  let restoringFromHistory = false;
  let hasNavigated = false;

  function cloneParams(params) {
    if (params === undefined || params === null) return null;
    try { return JSON.parse(JSON.stringify(params)); } catch (_) { return null; }
  }

  function sameEntry(a, page, params) {
    return a && a.page === page && JSON.stringify(a.params) === JSON.stringify(cloneParams(params));
  }

  window.navigate = function (page, params) {
    if (!restoringFromHistory) {
      const cur = history.state;
      const entry = { cumu: true, page, params: cloneParams(params) };
      try {
        if (!hasNavigated || !cur || !cur.cumu) {
          history.replaceState({ ...entry, depth: 0 }, '');
        } else if (sameEntry(cur, page, params)) {
          history.replaceState({ ...entry, depth: cur.depth || 0 }, '');
        } else {
          history.pushState({ ...entry, depth: (cur.depth || 0) + 1 }, '');
        }
      } catch (_) { /* params not serialisable – navigation still works */ }
      hasNavigated = true;
    }
    appNavigate(page, params);
    afterNavigate(page);
  };

  window.cumuGoBack = function () {
    if (history.state && history.state.cumu && history.state.depth > 0) {
      history.back();
    } else {
      window.navigate('discover');
    }
  };

  function closeOverlay() {
    const ctx = document.getElementById('contextMenu');
    if (ctx && !ctx.classList.contains('hidden') && ctx.style.display !== 'none') {
      CumuApp.closeContextMenu();
      return true;
    }
    const queuePanel = document.getElementById('cumuQueuePanel');
    if (queuePanel) { queuePanel.remove(); return true; }
    for (const id of ['addToPlaylistModal', 'addSongsToPlaylistModal', 'createPlaylistModal']) {
      const modal = document.getElementById(id);
      if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
        modal.remove();
        return true;
      }
    }
    return false;
  }

  let lastEntry = null;
  window.addEventListener('popstate', (e) => {
    const state = e.state;
    // Back pressed while a sheet/modal is open: close it and stay on the page.
    if (closeOverlay()) {
      if (lastEntry) {
        try { history.pushState(lastEntry, ''); } catch (_) {}
      }
      return;
    }
    if (!state || !state.cumu || !state.page) return;
    const loginModal = document.getElementById('loginModal');
    if (loginModal && !loginModal.classList.contains('hidden')) return;

    restoringFromHistory = true;
    try {
      window.navigate(state.page, state.params === null ? undefined : state.params);
    } finally {
      restoringFromHistory = false;
    }
  });

  // ── Tabs & top bar ─────────────────────────────────────────────────────────

  function afterNavigate(page) {
    lastEntry = history.state;
    document.body.dataset.page = page;
    if (TAB_FOR_PAGE[page]) activeTab = TAB_FOR_PAGE[page];

    document.querySelectorAll('#mobileTabBar .mobile-tab').forEach(btn => {
      const isActive = btn.dataset.tab === activeTab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    const backBtn = document.getElementById('mobileBackBtn');
    if (backBtn) {
      const canGoBack = history.state && history.state.cumu && history.state.depth > 0;
      backBtn.classList.toggle('hidden', !canGoBack || TAB_ROOT_PAGES.includes(page));
    }

    closeOverlay();
    updateMiniPlayer();
  }

  function openTab(tab) {
    const target = { home: 'discover', library: 'library', profile: 'settings' }[tab];
    if (!target) return;
    // Re-tapping the active tab while on its root scrolls back to the top.
    const state = CumuApp.getState();
    if (state.currentPage === target) {
      const main = document.getElementById('mainContent');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.navigate(target);
  }

  function openSearch() {
    if (CumuApp.getState().currentPage !== 'discover') window.navigate('discover');
    // Discover renders asynchronously; wait for the search field to exist.
    let tries = 0;
    const focus = () => {
      const input = document.getElementById('searchInput');
      if (input) { input.focus(); input.scrollIntoView({ block: 'start' }); return; }
      if (++tries < 40) setTimeout(focus, 50);
    };
    focus();
  }

  // ── Profile tab: settings page + account actions ───────────────────────────
  // The settings page is shared with desktop; on phones we add the entries that
  // live in the desktop sidebar (admin dashboard, logout).

  function enhanceSettingsPage() {
    if (!isMobile()) return;
    const main = document.getElementById('mainContent');
    if (!main || document.getElementById('mobileAccountActions')) return;
    const anchor = main.querySelector('h1');
    if (!anchor) return;

    const user = CumuApp.getState().user || {};
    const isAdmin = ['admin', 'creator'].includes(user.role);
    const block = document.createElement('div');
    block.id = 'mobileAccountActions';
    block.className = 'mobile-account-actions';
    block.innerHTML = `
      ${isAdmin ? `
        <button class="mobile-list-item" onclick="navigate('admin')">
          <span class="material-symbols-outlined">admin_panel_settings</span>
          <span class="flex-1 text-left">Admin dashboard</span>
          <span class="material-symbols-outlined text-text-muted">chevron_right</span>
        </button>` : ''}
      <button class="mobile-list-item" onclick="navigate('playlists')">
        <span class="material-symbols-outlined">queue_music</span>
        <span class="flex-1 text-left">Playlists</span>
        <span class="material-symbols-outlined text-text-muted">chevron_right</span>
      </button>
      <button class="mobile-list-item text-error" onclick="doLogout()">
        <span class="material-symbols-outlined">logout</span>
        <span class="flex-1 text-left">Logout</span>
      </button>`;

    // Place the actions right below the account summary card
    const header = anchor.closest('div');
    const accountCard = header.nextElementSibling;
    (accountCard || header).insertAdjacentElement('afterend', block);
  }

  // settings.js renders asynchronously, so watch the main container for it.
  const mainEl = document.getElementById('mainContent');
  if (mainEl) {
    new MutationObserver(() => {
      if (document.body.dataset.page === 'settings') enhanceSettingsPage();
    }).observe(mainEl, { childList: true });
  }

  // ── Mini player ────────────────────────────────────────────────────────────

  function coverUrl(song) {
    if (!song || !song.cover) return null;
    return song.cover.startsWith('http') ? song.cover : `/stream/cover/${song.cover}`;
  }

  let lastCover;
  function updateMiniPlayer(detail) {
    const state = CumuApp.getState();
    const song = (detail && detail.song) || state.currentSong;
    if (!song) return;
    const playing = detail ? detail.isPlaying : state.isPlaying;

    const title = document.getElementById('miniNpTitle');
    const artist = document.getElementById('miniNpArtist');
    const playIcon = document.getElementById('miniNpPlayIcon');
    const cover = document.getElementById('miniNpCover');
    const favBtn = document.getElementById('miniNpFavBtn');
    const favIcon = document.getElementById('miniNpFavIcon');

    if (title) title.textContent = song.title || 'Untitled';
    if (artist) artist.textContent = song.artist_name || song.artist || (song.isPodcast ? 'Podcast' : 'Unknown artist');
    if (playIcon) playIcon.textContent = playing ? 'pause' : 'play_arrow';

    const src = coverUrl(song);
    if (cover && src !== lastCover) {
      lastCover = src;
      cover.innerHTML = src
        ? `<img src="${src}" alt="">`
        : `<span class="material-symbols-outlined">${song.isPodcast ? 'podcasts' : 'music_note'}</span>`;
    }

    // Podcast episodes cannot be favorited
    if (favBtn) favBtn.classList.toggle('hidden', !!song.isPodcast);
    if (favIcon && detail && 'isFavorite' in detail) {
      favIcon.style.fontVariationSettings = detail.isFavorite ? "'FILL' 1" : "'FILL' 0";
      favIcon.classList.toggle('text-error', detail.isFavorite);
    }
  }

  document.addEventListener('cumu:player', (e) => updateMiniPlayer(e.detail));

  function toggleFavorite() {
    const song = CumuApp.getState().currentSong;
    if (song && song.id) CumuApp.toggleFavorite(song.id);
  }

  // ── Long press on a song opens its menu ────────────────────────────────────
  // Mobile browsers fire `contextmenu` on long press.

  document.addEventListener('contextmenu', (e) => {
    if (!isMobile()) return;
    const row = e.target.closest('.song-item[data-song-id]');
    if (!row) return;
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(10);
    CumuApp.openSongMenu(e, row.querySelector('.song-menu-btn') || row, row.dataset.songId);
  });

  // ── Touch reordering for the queue ─────────────────────────────────────────
  // The queue uses HTML5 drag & drop, which touch screens don't support. Dragging
  // the handle (drag_indicator icon) of a queue row moves the track instead.

  let drag = null;

  document.addEventListener('touchstart', (e) => {
    const handle = e.target.closest('.queue-drag-item .queue-handle, .queue-drag-item [title="Drag to reorder"]');
    if (!handle) return;
    const item = handle.closest('.queue-drag-item');
    const list = item && item.parentElement;
    if (!item || !list) return;
    drag = {
      item,
      list,
      from: parseInt(item.dataset.index, 10),
      to: parseInt(item.dataset.index, 10),
      startY: e.touches[0].clientY,
    };
    item.classList.add('queue-touch-dragging');
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!drag) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    drag.item.style.transform = `translateY(${y - drag.startY}px)`;

    drag.list.querySelectorAll('.queue-drag-item').forEach(el => el.classList.remove('queue-drop-target'));
    drag.item.style.visibility = 'hidden';
    const below = document.elementFromPoint(e.touches[0].clientX, y);
    drag.item.style.visibility = '';
    const target = below && below.closest('.queue-drag-item');
    if (target && target !== drag.item && !target.classList.contains('active')) {
      target.classList.add('queue-drop-target');
      drag.to = parseInt(target.dataset.index, 10);
    }

    // Auto-scroll near the edges of the list
    const rect = drag.list.getBoundingClientRect();
    if (y < rect.top + 48) drag.list.scrollTop -= 8;
    else if (y > rect.bottom - 48) drag.list.scrollTop += 8;
  }, { passive: false });

  function endDrag() {
    if (!drag) return;
    const { item, from, to } = drag;
    drag = null;
    item.style.transform = '';
    item.classList.remove('queue-touch-dragging');
    if (from !== to) CumuApp.moveQueueItem(from, to);
    else document.querySelectorAll('.queue-drop-target').forEach(el => el.classList.remove('queue-drop-target'));
  }
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);

  // ── Public API ─────────────────────────────────────────────────────────────

  window.CumuMobile = { openTab, openSearch, toggleFavorite, isMobile };
})();
