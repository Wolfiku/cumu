/**
 * public/js/scan-status.js
 * Shows the progress of the server-side library scan.
 *   - First scan of a fresh installation: full-screen lock until it is done
 *     (admins start it from there, other users wait).
 *   - Later scans: small progress card in the sidebar / strip on mobile.
 *   - While a scan runs, admins on desktop get an update button bottom right,
 *     so an urgent update (e.g. a security patch) does not have to wait.
 * The scan itself runs on the server; this only polls GET /admin/scan/status.
 */

'use strict';

const CumuScan = (() => {
  const POLL_ACTIVE_MS = 2000;
  const POLL_IDLE_MS   = 30000;

  let user = null;
  let timer = null;
  let lastStatus = null;
  let wasBlocking = false;
  const listeners = new Set();

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function isAdmin() {
    return !!user && ['admin', 'creator'].includes(user.role);
  }

  function formatEta(seconds) {
    if (!seconds || seconds < 60) return 'weniger als 1 Min.';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `ca. ${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `ca. ${hours} Std. ${rest} Min.` : `ca. ${hours} Std.`;
  }

  function phaseText(s) {
    if (s.phase === 'indexing') return `Dateien einlesen · ${s.index.done} von ${s.index.total}`;
    if (s.phase === 'lookup') return `Lieder erkennen · ${s.lookup.done} von ${s.lookup.total}`;
    return 'Wird vorbereitet…';
  }

  function percent(s) {
    return Math.min(100, Math.max(0, Math.round((s.progress || 0) * 100)));
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  async function poll() {
    clearTimeout(timer);
    let status = null;
    try {
      const res = await CumuApi.get('/admin/scan/status');
      if (res && typeof res.running === 'boolean') status = res;
    } catch {}
    if (status) {
      lastStatus = status;
      render(status);
      listeners.forEach(fn => { try { fn(status); } catch {} });
    }
    if (!user) return;
    const active = status && (status.running || status.blocking);
    timer = setTimeout(poll, active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
  }

  function start(currentUser) {
    user = currentUser;
    poll();
  }

  function stop() {
    user = null;
    clearTimeout(timer);
    removeBlocker();
    renderProgressWidgets(null);
    updateState = null;
    updateMessage = '';
    renderUpdateButton(null);
  }

  async function startScan() {
    const res = await CumuApi.post('/admin/scan', {});
    if (!res || res.error) throw new Error(res?.error || 'Scan konnte nicht gestartet werden');
    if (typeof res.running === 'boolean') {
      lastStatus = res;
      render(res);
    }
    poll();
    return res;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function render(s) {
    renderUpdateButton(s.running || s.blocking ? s : null);
    if (s.blocking) {
      renderBlocker(s);
      renderProgressWidgets(null);
      wasBlocking = true;
      return;
    }
    removeBlocker();
    renderProgressWidgets(s.running ? s : null);
    if (wasBlocking) {
      // The first scan just finished: reload the page so the library shows up
      wasBlocking = false;
      if (typeof showToast === 'function') showToast('Bibliothek ist bereit!');
      if (typeof navigate === 'function') navigate('discover');
    }
  }

  function renderBlocker(s) {
    let el = document.getElementById('scanBlocker');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scanBlocker';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'scanBlockerTitle');
      el.className = 'fixed inset-0 z-[9998] bg-background flex items-center justify-center p-md';
      document.body.appendChild(el);
    }

    let body;
    if (s.running) {
      body = `
        <h1 id="scanBlockerTitle" class="font-title-md text-title-md text-on-surface font-semibold">Bibliothek wird eingerichtet</h1>
        <p class="font-body-lg text-body-lg text-text-muted">cumu liest deine Musik ein und erkennt jedes Lied. Das passiert einmalig, danach kannst du loslegen. Du kannst das Fenster schließen, der Scan läuft auf dem Server weiter.</p>
        <div class="flex flex-col gap-xs mt-sm">
          <div class="flex justify-between font-body-sm text-body-sm">
            <span class="text-on-surface font-semibold">${esc(phaseText(s))}</span>
            <span class="text-text-muted tabular-nums">${percent(s)} %</span>
          </div>
          <div class="h-2 w-full rounded-full bg-surface-container-high overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(s)}">
            <div class="h-full bg-text-high-contrast rounded-full transition-all duration-500" style="width:${percent(s)}%"></div>
          </div>
          <div class="flex justify-between gap-md font-body-sm text-body-sm text-text-muted">
            <span class="truncate">${esc(s.current || '')}</span>
            <span class="whitespace-nowrap">noch ${esc(formatEta(s.etaSeconds))}</span>
          </div>
        </div>`;
    } else if (isAdmin()) {
      const found = s.newFiles + s.pending;
      body = `
        <h1 id="scanBlockerTitle" class="font-title-md text-title-md text-on-surface font-semibold">Bibliothek scannen</h1>
        <p class="font-body-lg text-body-lg text-text-muted">Im Musikordner ${found === 1 ? 'liegt 1 Lied' : `liegen ${found} Lieder`}, die noch nicht eingelesen sind. Bevor du cumu nutzen kannst, muss jedes Lied einmal gescannt und erkannt werden.</p>
        <p class="font-body-lg text-body-lg text-text-muted">Geschätzte Dauer: <span class="text-on-surface font-semibold">${esc(formatEta(s.etaSeconds))}</span>${s.lookupEnabled ? '' : ' (Metadaten-Suche ist ausgeschaltet)'}</p>
        <div class="flex items-center gap-md mt-sm">
          <button id="scanBlockerStart" class="px-lg py-sm bg-text-high-contrast text-background font-body-sm text-body-sm font-semibold rounded-lg hover:scale-105 active:scale-95 transition-all duration-200">Scan starten</button>
          <span id="scanBlockerError" class="font-body-sm text-body-sm text-danger"></span>
        </div>`;
    } else {
      body = `
        <h1 id="scanBlockerTitle" class="font-title-md text-title-md text-on-surface font-semibold">Bibliothek noch nicht eingerichtet</h1>
        <p class="font-body-lg text-body-lg text-text-muted">Ein Admin muss die Musikbibliothek einmal scannen, bevor cumu genutzt werden kann. Diese Seite aktualisiert sich von selbst.</p>`;
    }

    el.innerHTML = `
      <div class="w-full max-w-lg flex flex-col gap-md">
        <span class="font-headline-lg text-headline-lg lowercase text-on-surface font-bold">cumu</span>
        ${body}
      </div>`;

    const btn = document.getElementById('scanBlockerStart');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Startet…';
        try {
          await startScan();
        } catch (err) {
          const errEl = document.getElementById('scanBlockerError');
          if (errEl) errEl.textContent = err.message || 'Scan konnte nicht gestartet werden';
          btn.disabled = false;
          btn.textContent = 'Scan starten';
        }
      });
    }
  }

  function removeBlocker() {
    document.getElementById('scanBlocker')?.remove();
  }

  // Background scans: card above the settings link (desktop) and a thin strip
  // below the top bar (mobile)
  function renderProgressWidgets(s) {
    let card = document.getElementById('scanSidebarCard');
    let strip = document.getElementById('scanMobileStrip');
    if (!s) {
      card?.remove();
      strip?.remove();
      return;
    }

    const label = `${phaseText(s)} · noch ${formatEta(s.etaSeconds)}`;

    const settingsLink = document.getElementById('navItem-settings');
    if (!card && settingsLink) {
      card = document.createElement('div');
      card.id = 'scanSidebarCard';
      card.className = 'flex flex-col gap-xs px-md py-sm rounded-lg bg-surface-container-low';
      card.setAttribute('role', 'status');
      settingsLink.parentElement.insertBefore(card, settingsLink);
    }
    if (card) {
      card.innerHTML = `
        <div class="flex justify-between font-label-caps text-label-caps text-on-surface">
          <span>scan läuft</span><span class="tabular-nums">${percent(s)} %</span>
        </div>
        <div class="h-1 w-full rounded-full bg-surface-container-high overflow-hidden">
          <div class="h-full bg-text-high-contrast rounded-full transition-all duration-500" style="width:${percent(s)}%"></div>
        </div>
        <span class="font-body-sm text-body-sm text-text-muted leading-tight">${esc(label)}</span>`;
    }

    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'scanMobileStrip';
      strip.className = 'md:hidden fixed left-0 right-0 top-16 z-40 bg-surface-container-low border-b border-border-subtle';
      strip.setAttribute('role', 'status');
      document.body.appendChild(strip);
    }
    strip.innerHTML = `
      <div class="h-0.5 bg-text-high-contrast transition-all duration-500" style="width:${percent(s)}%"></div>
      <div class="px-gutter py-xs font-body-sm text-body-sm text-text-muted truncate">Scan ${percent(s)} % · ${esc(label)}</div>`;
  }

  // ── Update during a scan (admins, desktop only) ─────────────────────────────

  let updateState = null; // null | 'starting' | 'running' | 'done'
  let updateMessage = '';

  function renderUpdateButton(s) {
    let el = document.getElementById('scanUpdateButton');
    const busy = updateState === 'starting' || updateState === 'running';
    // Keep it visible while an update runs, even if the scan stops
    if ((!s || !isAdmin()) && !busy) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'scanUpdateButton';
      // Above the scan lock screen (z-9998) and the now-playing bar (h-24)
      el.className = 'hidden md:flex fixed bottom-28 right-6 z-[9999] max-w-xs flex-col items-end gap-xs';
      document.body.appendChild(el);
    }

    const label = updateState === 'starting' ? 'Update wird gestartet…'
      : updateState === 'running' ? 'Update läuft…'
      : 'Update installieren';
    el.innerHTML = `
      ${updateMessage ? `<div class="px-md py-sm rounded-lg bg-surface-container-low border border-border-subtle font-body-sm text-body-sm text-text-muted shadow-lg" role="status">${esc(updateMessage)}</div>` : ''}
      <button id="scanUpdateTrigger" ${busy ? 'disabled' : ''}
              title="Neueste Version jetzt installieren, ohne auf das Ende des Scans zu warten. Der Scan wird nach dem Neustart fortgesetzt."
              class="flex items-center gap-xs px-md py-sm rounded-lg bg-text-high-contrast text-background font-body-sm text-body-sm font-semibold shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:hover:scale-100">
        <span class="material-symbols-outlined text-[18px]">system_update_alt</span>${esc(label)}
      </button>`;
    el.querySelector('#scanUpdateTrigger').addEventListener('click', triggerUpdate);
  }

  async function triggerUpdate() {
    if (!confirm('Neueste Version jetzt installieren? cumu startet dabei kurz neu, der Scan wird danach fortgesetzt.')) return;
    updateState = 'starting';
    updateMessage = '';
    renderUpdateButton(lastStatus);
    try {
      const res = await CumuApi.post('/admin/update', {});
      if (!res || res.error) throw new Error(res?.error || 'Update konnte nicht gestartet werden');
      updateMessage = res.message || '';
      updateState = res.started ? 'running' : 'done';
      renderUpdateButton(lastStatus);
      if (res.started) waitForRestart();
    } catch (err) {
      updateState = 'done';
      updateMessage = err.message || 'Update konnte nicht gestartet werden';
      renderUpdateButton(lastStatus);
    }
  }

  // Reload the page once the server comes back after the update restart.
  // Gives up after 10 minutes (e.g. there was no newer version).
  async function waitForRestart() {
    const health = async () => {
      try {
        const r = await fetch('/health', { cache: 'no-store' });
        return r.ok ? (await r.json()).uptime : null;
      } catch { return null; }
    };
    const startUptime = await health();
    const deadline = Date.now() + 10 * 60 * 1000;
    let wentDown = false;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const uptime = await health();
      if (uptime === null) { wentDown = true; continue; }
      if (wentDown || (startUptime !== null && uptime < startUptime)) {
        window.location.reload();
        return;
      }
    }
    updateState = 'done';
    renderUpdateButton(lastStatus);
  }

  return {
    start, stop, poll, startScan, onChange, formatEta, phaseText, percent,
    get status() { return lastStatus; },
  };
})();

window.CumuScan = CumuScan;
