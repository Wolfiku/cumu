/**
 * public/js/settings.js
 * Redesigned Settings View Controller — Calculated Minimalism (Stitch Design System).
 */

'use strict';

function scorePassword(pw) {
  if (!pw) return { score: 0, label: '', percent: 0, color: 'var(--text-muted)' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 2) return { score, label: 'Schwaches Passwort', percent: 33, color: '#ba1a1a' };
  if (score <= 3) return { score, label: 'Mittelstarkes Passwort', percent: 66, color: '#665b43' };
  return { score, label: 'Starkes Passwort', percent: 100, color: '#000000' };
}

function renderSettingsPage(user, audioSettings = {}) {
  const crossfadeVal = audioSettings.crossfadeDuration !== undefined ? audioSettings.crossfadeDuration : 0;
  const gaplessVal = audioSettings.gaplessEnabled !== undefined ? audioSettings.gaplessEnabled : true;
  const podcastSearchVal = audioSettings.podcastSearchEnabled !== undefined ? audioSettings.podcastSearchEnabled : true;

  return `
<div class="p-md md:p-margin-desktop max-w-[960px] mx-auto w-full">
  <div class="mb-xl">
    <h1 class="text-headline-lg font-headline-lg text-text-high-contrast font-bold mb-xs">Einstellungen</h1>
    <p class="text-body-sm text-text-muted">Verwalte dein Konto, Audio-Präferenzen, Podcasts und System-Einstellungen</p>
  </div>

  <!-- ── Section 1: User Account Summary ────────────────────────── -->
  <div class="bg-surface-bright border border-border-subtle rounded-xl p-lg mb-xl flex items-center justify-between flex-wrap gap-md">
    <div class="flex items-center gap-md">
      <div class="w-14 h-14 rounded-full bg-text-high-contrast text-on-primary flex items-center justify-center text-xl font-bold">
        ${(user.username || 'U')[0].toUpperCase()}
      </div>
      <div>
        <div class="text-title-md font-title-md text-text-high-contrast font-bold">${esc(user.username || 'Benutzer')}</div>
        <div class="flex items-center gap-xs mt-xs">
          <span class="px-xs py-xxs rounded bg-surface-container text-text-high-contrast text-label-caps uppercase font-bold">
            ${esc(user.role || 'user')}
          </span>
          <span class="text-label-caps text-text-muted">&bull; cumu studio environment</span>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-xs text-label-caps text-text-muted">
      <span class="w-2 h-2 rounded-full bg-green-500"></span> Live Sync aktiv
    </div>
  </div>

  <!-- ── Section 2: Audio Engine & Playback ──────────────────────── -->
  <div class="bg-surface-bright border border-border-subtle rounded-xl p-xl mb-xl">
    <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-xs">Audiosystem & Übergänge</h2>
    <p class="text-body-sm text-text-muted mb-lg">Nahtlose Wiedergabe und digitales Crossfade.</p>

    <div class="flex flex-col gap-lg">
      <!-- Gapless Playback Toggle -->
      <div class="flex items-center justify-between gap-md p-md bg-background border border-border-subtle rounded-lg">
        <div>
          <div class="text-body-lg font-medium text-text-high-contrast">Nahtlose Wiedergabe (Gapless Playback)</div>
          <div class="text-body-sm text-text-muted mt-xs">Eliminiert Stillepausen zwischen Titeln.</div>
        </div>
        <label class="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
          <input type="checkbox" id="settingsGaplessToggle" ${gaplessVal ? 'checked' : ''} class="opacity-0 w-0 h-0">
          <span id="gaplessSliderBg" class="absolute inset-0 ${gaplessVal ? 'bg-text-high-contrast' : 'bg-border-subtle'} rounded-full transition-colors"></span>
          <span id="gaplessSliderKnob" class="absolute top-1 ${gaplessVal ? 'left-7' : 'left-1'} w-4 h-4 bg-white rounded-full transition-all"></span>
        </label>
      </div>

      <!-- Crossfade Slider -->
      <div class="p-md bg-background border border-border-subtle rounded-lg">
        <div class="flex items-center justify-between mb-md">
          <div>
            <div class="text-body-lg font-medium text-text-high-contrast">Sanftes Überblenden (Crossfade)</div>
            <div class="text-body-sm text-text-muted mt-xs">Überblendet das Ende eines Titels sanft in den nächsten.</div>
          </div>
          <div class="text-title-md font-bold text-text-high-contrast" id="crossfadeValDisplay">
            ${crossfadeVal > 0 ? crossfadeVal + ' Sek.' : 'Aus (0s)'}
          </div>
        </div>
        <input type="range" id="settingsCrossfadeRange" min="0" max="12" step="1" value="${crossfadeVal}" class="w-full accent-text-high-contrast cursor-pointer">
      </div>
    </div>
  </div>

  <!-- ── Section 3: Podcast-Einstellungen ────────────────────────── -->
  <div class="bg-surface-bright border border-border-subtle rounded-xl p-xl mb-xl">
    <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-xs">Podcasts</h2>
    <p class="text-body-sm text-text-muted mb-lg">Sichtbarkeit und Verhalten von Podcasts in der Anwendung.</p>

    <div class="flex items-center justify-between gap-md p-md bg-background border border-border-subtle rounded-lg">
      <div>
        <div class="text-body-lg font-medium text-text-high-contrast">Podcasts in der Suche finden</div>
        <div class="text-body-sm text-text-muted mt-xs">Ermöglicht das Suchen und Anzeigen von Podcasts in den allgemeinen Suchergebnissen.</div>
      </div>
      <label class="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
        <input type="checkbox" id="settingsPodcastSearchToggle" ${podcastSearchVal ? 'checked' : ''} class="opacity-0 w-0 h-0">
        <span id="podcastSearchSliderBg" class="absolute inset-0 ${podcastSearchVal ? 'bg-text-high-contrast' : 'bg-border-subtle'} rounded-full transition-colors"></span>
        <span id="podcastSearchSliderKnob" class="absolute top-1 ${podcastSearchVal ? 'left-7' : 'left-1'} w-4 h-4 bg-white rounded-full transition-all"></span>
      </label>
    </div>
  </div>

  <!-- ── Section: Navigation & Sichtbarkeit ──────────────────────── -->
  ${(() => {
    const showFavoritesVal = window.CumuApp?.getShowFavorites ? window.CumuApp.getShowFavorites() : (localStorage.getItem('cumu_show_favorites') !== 'false');
    const showPodcastsVal = window.CumuApp?.getShowPodcasts ? window.CumuApp.getShowPodcasts() : (localStorage.getItem('cumu_show_podcasts') !== 'false');
    return `
      <div class="bg-surface-bright border border-border-subtle rounded-xl p-xl mb-xl">
        <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-xs">Navigation & Menü-Sichtbarkeit</h2>
        <p class="text-body-sm text-text-muted mb-lg">Pass an, welche Bereiche in der Sidebar und Mediathek angezeigt werden.</p>

        <div class="flex flex-col gap-md">
          <!-- Show Favorites Toggle -->
          <div class="flex items-center justify-between gap-md p-md bg-background border border-border-subtle rounded-lg">
            <div>
              <div class="text-body-lg font-medium text-text-high-contrast">Lieblingslieder anzeigen</div>
              <div class="text-body-sm text-text-muted mt-xs">Blendet "Lieblingslieder" in der linken Navigation und Mediathek ein.</div>
            </div>
            <label class="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
              <input type="checkbox" id="settingsShowFavoritesToggle" ${showFavoritesVal ? 'checked' : ''} class="opacity-0 w-0 h-0">
              <span id="showFavoritesSliderBg" class="absolute inset-0 ${showFavoritesVal ? 'bg-text-high-contrast' : 'bg-border-subtle'} rounded-full transition-colors"></span>
              <span id="showFavoritesSliderKnob" class="absolute top-1 ${showFavoritesVal ? 'left-7' : 'left-1'} w-4 h-4 bg-white rounded-full transition-all"></span>
            </label>
          </div>

          <!-- Show Podcasts Toggle -->
          <div class="flex items-center justify-between gap-md p-md bg-background border border-border-subtle rounded-lg">
            <div>
              <div class="text-body-lg font-medium text-text-high-contrast">Podcasts anzeigen</div>
              <div class="text-body-sm text-text-muted mt-xs">Blendet "Podcasts" in der linken Navigation und Mediathek ein.</div>
            </div>
            <label class="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
              <input type="checkbox" id="settingsShowPodcastsToggle" ${showPodcastsVal ? 'checked' : ''} class="opacity-0 w-0 h-0">
              <span id="showPodcastsSliderBg" class="absolute inset-0 ${showPodcastsVal ? 'bg-text-high-contrast' : 'bg-border-subtle'} rounded-full transition-colors"></span>
              <span id="showPodcastsSliderKnob" class="absolute top-1 ${showPodcastsVal ? 'left-7' : 'left-1'} w-4 h-4 bg-white rounded-full transition-all"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  })()}

  <!-- ── Section 4: Offline-Speicher & Downloads ──────────────────── -->
  <div class="bg-surface-bright border border-border-subtle rounded-xl p-xl mb-xl">
    <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-xs">Offline-Speicher & Downloads</h2>
    <p class="text-body-sm text-text-muted mb-lg">Im Browser (IndexedDB) gespeicherte Playlists verwalten.</p>

    <div class="p-md bg-background border border-border-subtle rounded-lg flex items-center justify-between flex-wrap gap-md">
      <div>
        <div class="text-body-lg font-medium text-text-high-contrast" id="settingsOfflineStats">
          Lade Speicherdaten…
        </div>
        <div class="text-body-sm text-text-muted mt-xs">Gleicher Browser / Lokal auf diesem Gerät</div>
      </div>
      <button class="px-md py-sm rounded-lg font-body-sm text-body-sm text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-800 transition-colors active:scale-95 font-bold" onclick="clearOfflineStorageFromSettings()">
        Offline-Speicher leeren
      </button>
    </div>
  </div>

  <!-- ── Section 5: Design System Status ──────────────────────────── -->
  <div class="bg-surface-bright border border-border-subtle rounded-xl p-xl mb-xl">
    <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-xs">Design System</h2>
    <p class="text-body-sm text-text-muted mb-md">Aktiviertes Design-System für deine cumu Instanz.</p>

    <div class="border border-text-high-contrast rounded-lg p-md bg-background flex items-center justify-between">
      <div>
        <strong class="text-body-lg font-bold block text-text-high-contrast">Calculated Minimalism (Stitch Cumu Identity)</strong>
        <div class="text-body-sm text-text-muted mt-xs">Pure White Canvas &bull; Inter Typografie &bull; desaturiertes Akzentgrau</div>
      </div>
      <span class="px-md py-xs rounded-full text-label-caps font-bold bg-text-high-contrast text-on-primary">Aktiv</span>
    </div>
  </div>

  <!-- ── Section 5: Passwort ändern ──────────────────────────────── -->
  <div class="bg-surface-bright border border-border-subtle rounded-xl p-xl">
    <h2 class="text-title-md font-title-md text-text-high-contrast font-bold mb-xs">Passwort ändern</h2>
    <p class="text-body-sm text-text-muted mb-lg">Erstelle ein neues, sicheres Passwort.</p>

    <form id="settingsPwForm" novalidate class="flex flex-col gap-md max-w-md">
      <div class="flex flex-col gap-xs">
        <label for="settingsCurrPw" class="text-label-caps text-text-muted lowercase">Aktuelles Passwort</label>
        <input type="password" id="settingsCurrPw" name="currentPassword" required placeholder="Aktuelles Passwort"
               class="w-full px-md py-sm bg-background border border-border-subtle rounded-lg text-body-sm text-text-high-contrast focus:outline-none focus:border-text-high-contrast">
      </div>
      
      <div class="flex flex-col gap-xs">
        <label for="settingsNewPw" class="text-label-caps text-text-muted lowercase">Neues Passwort</label>
        <input type="password" id="settingsNewPw" name="newPassword" required placeholder="Neues Passwort (min. 8 Zeichen)"
               class="w-full px-md py-sm bg-background border border-border-subtle rounded-lg text-body-sm text-text-high-contrast focus:outline-none focus:border-text-high-contrast">
        <div id="pwMeterContainer" class="hidden mt-xs">
          <div class="h-1.5 w-full bg-border-subtle rounded-full overflow-hidden">
            <div id="pwMeterBar" class="h-full w-0 transition-all"></div>
          </div>
          <div id="pwMeterLabel" class="text-label-caps mt-xs font-bold"></div>
        </div>
      </div>

      <div class="flex flex-col gap-xs">
        <label for="settingsConfirmPw" class="text-label-caps text-text-muted lowercase">Passwort bestätigen</label>
        <input type="password" id="settingsConfirmPw" name="confirmPassword" required placeholder="Passwort wiederholen"
               class="w-full px-md py-sm bg-background border border-border-subtle rounded-lg text-body-sm text-text-high-contrast focus:outline-none focus:border-text-high-contrast">
      </div>

      <div id="settingsPwError" class="hidden text-body-sm text-error bg-error-container/30 rounded-lg p-sm"></div>
      <div id="settingsPwSuccess" class="hidden text-body-sm text-green-600 bg-green-50 rounded-lg p-sm"></div>

      <button type="submit" id="settingsPwBtn" class="mt-sm py-md px-lg bg-text-high-contrast text-on-primary rounded-lg text-label-caps font-bold hover:bg-interactive-hover transition-all active:scale-95">
        Passwort aktualisieren
      </button>
    </form>
  </div>
</div>`;
}

async function initSettingsPage() {
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  let user = {};
  let audioSettings = { crossfadeDuration: 0, gaplessEnabled: true, podcastSearchEnabled: true };

  try {
    user = await CumuApi.get('/user/settings');
    const syncData = await CumuApi.get('/api/sync');
    if (syncData && syncData.extraSettings) {
      if (syncData.extraSettings.crossfadeDuration !== undefined) audioSettings.crossfadeDuration = syncData.extraSettings.crossfadeDuration;
      if (syncData.extraSettings.gaplessEnabled !== undefined) audioSettings.gaplessEnabled = syncData.extraSettings.gaplessEnabled;
      if (syncData.extraSettings.podcastSearchEnabled !== undefined) audioSettings.podcastSearchEnabled = syncData.extraSettings.podcastSearchEnabled;
    }
  } catch (_) {}

  mainContent.innerHTML = renderSettingsPage(user, audioSettings);

  updateOfflineStats();

  // ── Gapless Toggle Handler ─────────────────────────────────────────
  const gaplessToggle = document.getElementById('settingsGaplessToggle');
  if (gaplessToggle) {
    gaplessToggle.addEventListener('change', async () => {
      const isEnabled = gaplessToggle.checked;
      const bg = document.getElementById('gaplessSliderBg');
      const knob = document.getElementById('gaplessSliderKnob');
      if (bg) {
        bg.classList.toggle('bg-text-high-contrast', isEnabled);
        bg.classList.toggle('bg-border-subtle', !isEnabled);
      }
      if (knob) {
        knob.style.left = isEnabled ? '28px' : '4px';
      }

      if (window.CumuAudioEngine) {
        window.CumuAudioEngine.setGapless(isEnabled);
      }

      await saveAudioSettings({ gaplessEnabled: isEnabled });
    });
  }

  // ── Podcast Search Toggle Handler ─────────────────────────────────
  const podcastSearchToggle = document.getElementById('settingsPodcastSearchToggle');
  if (podcastSearchToggle) {
    podcastSearchToggle.addEventListener('change', async () => {
      const isEnabled = podcastSearchToggle.checked;
      const bg = document.getElementById('podcastSearchSliderBg');
      const knob = document.getElementById('podcastSearchSliderKnob');
      if (bg) {
        bg.classList.toggle('bg-text-high-contrast', isEnabled);
        bg.classList.toggle('bg-border-subtle', !isEnabled);
      }
      if (knob) {
        knob.style.left = isEnabled ? '28px' : '4px';
      }

      await saveAudioSettings({ podcastSearchEnabled: isEnabled });
    });
  }

  // ── Show Favorites Toggle Handler ──────────────────────────────────
  const showFavToggle = document.getElementById('settingsShowFavoritesToggle');
  if (showFavToggle) {
    showFavToggle.addEventListener('change', () => {
      const isEnabled = showFavToggle.checked;
      const bg = document.getElementById('showFavoritesSliderBg');
      const knob = document.getElementById('showFavoritesSliderKnob');
      if (bg) {
        bg.classList.toggle('bg-text-high-contrast', isEnabled);
        bg.classList.toggle('bg-border-subtle', !isEnabled);
      }
      if (knob) {
        knob.style.left = isEnabled ? '28px' : '4px';
      }
      if (window.CumuApp?.setShowFavorites) {
        window.CumuApp.setShowFavorites(isEnabled);
      }
    });
  }

  // ── Show Podcasts Toggle Handler ───────────────────────────────────
  const showPodToggle = document.getElementById('settingsShowPodcastsToggle');
  if (showPodToggle) {
    showPodToggle.addEventListener('change', () => {
      const isEnabled = showPodToggle.checked;
      const bg = document.getElementById('showPodcastsSliderBg');
      const knob = document.getElementById('showPodcastsSliderKnob');
      if (bg) {
        bg.classList.toggle('bg-text-high-contrast', isEnabled);
        bg.classList.toggle('bg-border-subtle', !isEnabled);
      }
      if (knob) {
        knob.style.left = isEnabled ? '28px' : '4px';
      }
      if (window.CumuApp?.setShowPodcasts) {
        window.CumuApp.setShowPodcasts(isEnabled);
      }
    });
  }

  // ── Crossfade Slider Handler ───────────────────────────────────────
  const crossfadeRange = document.getElementById('settingsCrossfadeRange');
  const crossfadeDisplay = document.getElementById('crossfadeValDisplay');
  if (crossfadeRange) {
    crossfadeRange.addEventListener('input', () => {
      const val = parseInt(crossfadeRange.value, 10);
      if (crossfadeDisplay) {
        crossfadeDisplay.textContent = val > 0 ? `${val} Sek.` : 'Aus (0s)';
      }
      if (window.CumuAudioEngine) {
        window.CumuAudioEngine.setCrossfade(val);
      }
    });

    crossfadeRange.addEventListener('change', async () => {
      const val = parseInt(crossfadeRange.value, 10);
      await saveAudioSettings({ crossfadeDuration: val });
    });
  }

  // ── Password strength meter ───────────────────────────────────────
  const newPwInput = document.getElementById('settingsNewPw');
  const meterContainer = document.getElementById('pwMeterContainer');
  const meterBar = document.getElementById('pwMeterBar');
  const meterLabel = document.getElementById('pwMeterLabel');

  if (newPwInput) {
    newPwInput.addEventListener('input', () => {
      const val = newPwInput.value;
      if (!val) {
        meterContainer.classList.add('hidden');
        return;
      }
      meterContainer.classList.remove('hidden');
      const res = scorePassword(val);
      meterBar.style.width = res.percent + '%';
      meterBar.style.background = res.color;
      meterLabel.textContent = res.label;
      meterLabel.style.color = res.color;
    });
  }

  // ── Password Form Submit ──────────────────────────────────────────
  const pwForm = document.getElementById('settingsPwForm');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwError   = document.getElementById('settingsPwError');
      const pwSuccess = document.getElementById('settingsPwSuccess');
      pwError.classList.add('hidden');
      pwSuccess.classList.add('hidden');

      const btn = document.getElementById('settingsPwBtn');
      btn.disabled = true;
      btn.textContent = 'Speichern…';

      const body = {
        currentPassword: document.getElementById('settingsCurrPw').value,
        newPassword:     document.getElementById('settingsNewPw').value,
        confirmPassword: document.getElementById('settingsConfirmPw').value,
      };

      if (body.newPassword.length < 8) {
        showMsg(pwError, 'Neues Passwort muss mindestens 8 Zeichen lang sein.');
        btn.disabled = false; btn.textContent = 'Passwort aktualisieren';
        return;
      }
      if (body.newPassword !== body.confirmPassword) {
        showMsg(pwError, 'Passwörter stimmen nicht überein.');
        btn.disabled = false; btn.textContent = 'Passwort aktualisieren';
        return;
      }

      try {
        const res = await CumuApi.post('/user/change-password', body);
        if (res.success) {
          showMsg(pwSuccess, res.message || 'Passwort erfolgreich geändert.');
          pwForm.reset();
          if (meterContainer) meterContainer.classList.add('hidden');
        } else {
          showMsg(pwError, res.error || 'Fehler beim Ändern des Passworts.');
        }
      } catch (err) {
        showMsg(pwError, err.message || 'Netzwerkfehler.');
      } finally {
        btn.disabled = false; btn.textContent = 'Passwort aktualisieren';
      }
    });
  }
}

async function saveAudioSettings(newSettings = {}) {
  try {
    const currentSync = await CumuApi.get('/api/sync');
    const existingExtra = (currentSync && currentSync.extraSettings) ? currentSync.extraSettings : {};
    const updatedExtra = { ...existingExtra, ...newSettings };
    await CumuApi.post('/api/sync', { extraSettings: updatedExtra });
  } catch (e) {
    console.warn('[settings] could not sync audio settings:', e);
  }
}

function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function updateOfflineStats() {
  const el = document.getElementById('settingsOfflineStats');
  if (!el) return;

  if (window.CumuOfflineStore) {
    const stats = await CumuOfflineStore.getStorageStats();
    if (stats.playlistCount > 0) {
      el.textContent = `${stats.playlistCount} Playlist(s) &bull; ${stats.songCount} Songs (${stats.formattedSize})`;
    } else {
      el.textContent = `Keine Offline-Playlists gespeichert (0 B)`;
    }
  } else {
    el.textContent = `Offline-Speicher nicht unterstützt`;
  }
}

async function clearOfflineStorageFromSettings() {
  if (!window.CumuOfflineStore) return;
  if (confirm('Möchtest du wirklich den gesamten Offline-Speicher (alle heruntergeladenen Playlists und Audio-Dateien) im Browser leeren?')) {
    await CumuOfflineStore.clearAllOffline();
    if (typeof showToast === 'function') showToast('Offline-Speicher geleert');
    updateOfflineStats();
  }
}

window.clearOfflineStorageFromSettings = clearOfflineStorageFromSettings;
window.initSettingsPage = initSettingsPage;
