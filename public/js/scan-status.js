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

  const num = n => Number(n || 0).toLocaleString('de-DE');

  function phaseText(s) {
    const phases = ['discovering', 'indexing', ...(s.lookupEnabled ? ['lookup'] : []), ...(s.coversEnabled || s.phase === 'covers' ? ['covers'] : [])];
    const step = `Schritt ${phases.indexOf(s.phase) + 1}/${phases.length}`;
    if (s.phase === 'discovering') return `${step} · Ordner durchsuchen · ${num(s.discovered)} Audiodateien gefunden`;
    if (s.phase === 'indexing') return `${step} · Dateien einlesen · ${num(s.index.done)} von ${num(s.index.total)}`;
    if (s.phase === 'lookup') return `${step} · Lieder erkennen · ${num(s.lookup.done)} von ${num(s.lookup.total)}`;
    if (s.phase === 'covers') return `${step} · Album-Cover laden · ${num(s.covers?.done)} von ${num(s.covers?.total)}`;
    return 'Wird vorbereitet…';
  }

  // What the scan is working on right now, with a label saying what it is
  function currentText(s) {
    if (!s.current) return s.phase === 'discovering' && s.musicPath ? `Ordner: ${s.musicPath}` : '';
    if (s.phase === 'discovering') return `Ordner: ${s.current}`;
    if (s.phase === 'indexing') return `Datei: ${s.current}`;
    if (s.phase === 'lookup') return `Lied: ${s.current}`;
    if (s.phase === 'covers') return `Album: ${s.current}`;
    return s.current;
  }

  function etaText(s) {
    return s.phase === 'discovering' ? 'Dauer wird berechnet…' : `noch ${formatEta(s.etaSeconds)}`;
  }

  function percent(s) {
    return Math.min(100, Math.max(0, Math.round((s.progress || 0) * 100)));
  }

  function percentText(s) {
    return s.phase === 'discovering' ? '' : `${percent(s)} %`;
  }

  // Progress bar; while the folder is searched the total is unknown, so the
  // bar moves back and forth instead of filling up
  function barHtml(s, heightClass = 'h-1.5') {
    if (!document.getElementById('cumuScanBarStyles')) {
      const st = document.createElement('style');
      st.id = 'cumuScanBarStyles';
      st.textContent = '@keyframes cumu-scan-indet{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}'
        + '.cumu-scan-indet{width:40%;animation:cumu-scan-indet 1.3s ease-in-out infinite}'
        + '@media (prefers-reduced-motion: reduce){.cumu-scan-indet{animation:none;width:100%;opacity:.5}}';
      document.head.appendChild(st);
    }
    const indet = s.phase === 'discovering';
    const pct = percent(s);
    return `<div class="${heightClass} w-full rounded-full bg-surface-container-high overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${indet ? 'aria-valuetext="Ordner werden durchsucht"' : `aria-valuenow="${pct}"`}>
      <div class="h-full bg-text-high-contrast rounded-full ${indet ? 'cumu-scan-indet' : 'transition-all duration-500'}" ${indet ? '' : `style="width:${pct}%"`}></div>
    </div>`;
  }

  function lastResultText(r) {
    if (!r) return '';
    const where = r.musicPath ? ` in ${r.musicPath}` : '';
    if (!r.found && !r.added) return `Letzter Scan: keine Audiodateien${where} gefunden. Stimmt der Musik-Ordner in den Einstellungen?`;
    const c = r.covers || {};
    const coverCount = (c.found || 0) + (c.embedded || 0);
    const coverText = coverCount || c.none ? `, ${num(coverCount)} Album-Cover ergänzt` : '';
    return `Letzter Scan: ${num(r.found)} Audiodateien${where}, ${num(r.added)} neu hinzugefügt, ${num(r.matched)} erkannt, ${num(r.unmatched)} ohne Treffer${r.error ? `, ${num(r.error)} fehlgeschlagen` : ''}${coverText}.`;
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
          <div class="flex justify-between gap-md font-body-sm text-body-sm">
            <span class="text-on-surface font-semibold">${esc(phaseText(s))}</span>
            <span class="text-text-muted tabular-nums">${esc(percentText(s))}</span>
          </div>
          ${barHtml(s, 'h-2')}
          <div class="flex justify-between gap-md font-body-sm text-body-sm text-text-muted">
            <span class="truncate" title="${esc(currentText(s))}">${esc(currentText(s))}</span>
            <span class="whitespace-nowrap">${esc(etaText(s))}</span>
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

    const label = `${phaseText(s)} · ${etaText(s)}`;

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
          <span>scan läuft</span><span class="tabular-nums">${esc(percentText(s))}</span>
        </div>
        ${barHtml(s, 'h-1')}
        <span class="font-body-sm text-body-sm text-text-muted leading-tight">${esc(label)}</span>
        <span class="font-body-sm text-body-sm text-text-muted leading-tight truncate" title="${esc(currentText(s))}">${esc(currentText(s))}</span>`;
    }

    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'scanMobileStrip';
      strip.className = 'md:hidden fixed left-0 right-0 top-16 z-40 bg-surface-container-low border-b border-border-subtle';
      strip.setAttribute('role', 'status');
      document.body.appendChild(strip);
    }
    strip.innerHTML = `
      ${barHtml(s, 'h-0.5')}
      <div class="px-gutter py-xs font-body-sm text-body-sm text-text-muted truncate">Scan ${esc(percentText(s))} · ${esc(label)}</div>`;
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
    percentText, currentText, etaText, barHtml, lastResultText,
    get status() { return lastStatus; },
  };
})();

window.CumuScan = CumuScan;
