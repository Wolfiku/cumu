/**
 * public/js/covers.js
 * Album covers in the web client:
 *   - one-time notice for admins of an existing library: covers can now be
 *     added automatically; choose the cover folder and start the cover scan
 *   - live check for cover folder inputs (popup + admin settings)
 * The notice is shown once per installation (the server remembers it was
 * closed) and never on top of the first-scan lock screen.
 */

'use strict';

const CumuCovers = (() => {
  let shownThisSession = false;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const num = n => Number(n || 0).toLocaleString('de-DE');

  /** Live check of a cover folder input; returns CumuPathCheck's handle. */
  function attachPathCheck(input, row) {
    return CumuPathCheck.attach(input, {
      iconHost: row,
      messageHost: row.parentElement,
      check: p => CumuApi.post('/admin/cover-path/check', { path: p }),
    });
  }

  // ── One-time notice ─────────────────────────────────────────────────────────

  async function maybeAnnounce(user) {
    if (shownThisSession || !user || !['admin', 'creator'].includes(user.role)) return;
    let status;
    try {
      status = await CumuApi.get('/admin/covers/status');
    } catch { return; }
    if (!status || !status.announcement) return;

    // Not while the first scan locks the client: wait until it is done
    const showWhenFree = (scanStatus) => {
      if (scanStatus?.blocking || shownThisSession) return false;
      shownThisSession = true;
      renderNotice(status);
      return true;
    };
    if (CumuScan.status) {
      if (showWhenFree(CumuScan.status)) return;
    }
    const unsubscribe = CumuScan.onChange(s => { if (showWhenFree(s)) unsubscribe(); });
  }

  function close() {
    document.getElementById('coverNotice')?.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') dismiss();
  }

  async function dismiss() {
    close();
    try { await CumuApi.post('/admin/covers/announcement/dismiss', {}); } catch {}
  }

  function renderNotice(status) {
    close();
    const missing = status.total - status.withCover;
    const el = document.createElement('div');
    el.id = 'coverNotice';
    el.className = 'fixed inset-0 z-[9997] bg-black/40 flex items-center justify-center p-md';
    el.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="coverNoticeTitle"
           class="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-background border border-border-subtle rounded-xl shadow-2xl p-lg flex flex-col gap-md">
        <div class="flex items-start justify-between gap-md">
          <div class="flex items-center gap-sm">
            <span class="material-symbols-outlined text-[28px] text-on-surface">album</span>
            <h2 id="coverNoticeTitle" class="font-title-md text-title-md text-on-surface font-semibold">Neu: Album-Cover automatisch</h2>
          </div>
          <button type="button" id="coverNoticeClose" class="text-text-muted hover:text-on-surface" aria-label="Schließen">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <p class="font-body-sm text-body-sm text-text-muted">
          cumu kann fehlende Album-Cover jetzt selbst ergänzen: zuerst aus den Bildern in deinen Musikdateien,
          sonst von MusicBrainz (Cover Art Archive). Jedes Cover wird einmal heruntergeladen und auf deinem
          Server gespeichert, ca. 100 KB pro Album. Vorhandene Cover werden nie ersetzt.
        </p>
        <p class="font-body-sm text-body-sm text-on-surface">
          ${missing > 0
            ? `<strong>${num(missing)}</strong> von ${num(status.total)} Alben haben noch kein Cover.`
            : 'Alle Alben haben schon ein Cover. Neue Alben bekommen ihres künftig automatisch.'}
        </p>

        <div class="flex flex-col gap-xs">
          <label for="coverNoticePath" class="font-body-sm text-body-sm text-on-surface font-semibold">Cover-Ordner</label>
          <div id="coverNoticePathRow" class="flex items-center gap-sm">
            <input type="text" id="coverNoticePath" value="${esc(status.coverPath)}" spellcheck="false" autocomplete="off"
                   class="flex-1 min-w-0 font-body-sm text-body-sm text-on-surface bg-surface-container-low border border-border-subtle rounded-lg px-md py-sm focus:outline-none focus:border-text-muted" />
          </div>
          <span class="font-body-sm text-body-sm text-text-muted">Eigener Ordner auf dem Server, nicht im Musikordner. Standard: <code>${esc(status.coverPathDefault)}</code>. Bereits vorhandene Cover werden dorthin verschoben.</span>
        </div>

        <label class="flex items-start gap-sm font-body-sm text-body-sm text-on-surface cursor-pointer">
          <input type="checkbox" id="coverNoticeOnline" ${status.onlineEnabled ? 'checked' : ''} class="mt-0.5 rounded border-border-subtle" />
          <span>Auch online suchen (MusicBrainz / Cover Art Archive). Ohne Haken werden nur Bilder aus den Musikdateien verwendet.</span>
        </label>

        <div class="flex flex-wrap items-center gap-md pt-sm border-t border-border-subtle">
          <button type="button" id="coverNoticeStart" class="px-lg py-sm bg-text-high-contrast text-background font-body-sm text-body-sm font-semibold rounded-lg hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:hover:scale-100">
            Speichern &amp; Cover laden
          </button>
          <button type="button" id="coverNoticeLater" class="px-md py-sm text-text-muted hover:text-on-surface font-body-sm text-body-sm rounded-lg hover:bg-surface-bright transition-colors">
            Später
          </button>
          <span id="coverNoticeError" class="font-body-sm text-body-sm text-red-500" role="alert"></span>
        </div>
        <p class="font-body-sm text-body-sm text-text-muted">
          Dieser Hinweis erscheint nur einmal. Ordner und Schalter findest du jederzeit unter
          Admin → Server Config &amp; Stats, den Cover-Scan unter Admin → Scan Library.
        </p>
      </div>`;
    document.body.appendChild(el);
    document.addEventListener('keydown', onKey);

    const input = document.getElementById('coverNoticePath');
    const pathCheck = attachPathCheck(input, document.getElementById('coverNoticePathRow'));

    document.getElementById('coverNoticeClose').addEventListener('click', dismiss);
    document.getElementById('coverNoticeLater').addEventListener('click', dismiss);

    const startBtn = document.getElementById('coverNoticeStart');
    startBtn.addEventListener('click', async () => {
      const errEl = document.getElementById('coverNoticeError');
      errEl.textContent = '';
      const result = await pathCheck.run();
      if (result && result.status === 'error') {
        errEl.textContent = result.message;
        input.focus();
        return;
      }
      startBtn.disabled = true;
      startBtn.textContent = 'Startet…';
      try {
        const res = await CumuApi.post('/admin/covers/setup', {
          coverPath: input.value.trim(),
          onlineEnabled: document.getElementById('coverNoticeOnline').checked,
        });
        if (!res || res.error) throw new Error(res?.error || 'Speichern fehlgeschlagen');
        close();
        if (typeof showToast === 'function') showToast('Album-Cover werden geladen…');
        CumuScan.poll();
      } catch (err) {
        errEl.textContent = err.message || 'Speichern fehlgeschlagen';
        startBtn.disabled = false;
        startBtn.textContent = 'Speichern & Cover laden';
      }
    });
  }

  return { maybeAnnounce, attachPathCheck };
})();

window.CumuCovers = CumuCovers;
