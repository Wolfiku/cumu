/**
 * public/js/path-check.js
 * Live check for music folder inputs (setup wizard + admin settings).
 * After typing (debounced) or leaving the field, the server checks the path
 * and an icon next to the input shows the result:
 *   green check  — folder found and contains audio files
 *   amber "!"    — can be saved, but something looks off (empty, missing, …)
 *   red "!"      — wrong path, cannot be saved
 * Hovering / focusing the icon shows the explanation; a short line below the
 * input shows it too (touch devices have no hover).
 */

'use strict';

const CumuPathCheck = (() => {
  const COLORS = { ok: '#22c55e', warn: '#f59e0b', error: '#ef4444', checking: '#9ca3af' };
  const ICONS = {
    ok: '<path d="M20 6 9 17l-5-5"/>',
    warn: '<path d="M12 8v5"/><path d="M12 16.5v.01"/>',
    error: '<path d="M12 8v5"/><path d="M12 16.5v.01"/>',
    checking: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function injectStyles() {
    if (document.getElementById('cumuPathCheckStyles')) return;
    const style = document.createElement('style');
    style.id = 'cumuPathCheckStyles';
    style.textContent = `
      .cpc-wrap { position: relative; display: inline-flex; flex-shrink: 0; }
      .cpc-icon { width: 24px; height: 24px; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center; cursor: help; outline: none; }
      .cpc-icon:focus-visible { box-shadow: 0 0 0 2px currentColor; }
      .cpc-icon svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .cpc-icon.checking svg { stroke: currentColor; animation: cpc-spin .8s linear infinite; }
      @keyframes cpc-spin { to { transform: rotate(360deg); } }
      .cpc-tip { display: none; position: absolute; z-index: 10000; right: 0; top: calc(100% + 8px); width: min(340px, 80vw);
                 padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 1.4; text-align: left;
                 background: #111827; color: #f9fafb; box-shadow: 0 8px 24px rgba(0,0,0,.35); white-space: normal; overflow-wrap: anywhere; }
      .cpc-tip code { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; background: rgba(255,255,255,.12); color: inherit; padding: 1px 4px; border-radius: 4px; }
      .cpc-tip b { display: block; margin-bottom: 4px; }
      .cpc-wrap:hover .cpc-tip, .cpc-icon:focus + .cpc-tip { display: block; }
      .cpc-msg { font-size: 13px; line-height: 1.35; margin-top: 4px; }
    `;
    document.head.appendChild(style);
  }

  /**
   * @param {HTMLInputElement} input
   * @param {object} opts
   * @param {(path: string) => Promise<object>} opts.check  calls the server
   * @param {HTMLElement} [opts.iconHost]  element the icon is appended to (default: after the input)
   * @param {HTMLElement} [opts.messageHost] element for the short message line (default: after the icon host)
   * @returns {{ run: () => Promise<object|null>, get result(): object|null }}
   */
  function attach(input, opts) {
    injectStyles();

    const wrap = document.createElement('span');
    wrap.className = 'cpc-wrap';
    wrap.innerHTML = '<span class="cpc-icon" tabindex="0" role="img"></span><span class="cpc-tip" role="tooltip"></span>';
    const icon = wrap.querySelector('.cpc-icon');
    const tip = wrap.querySelector('.cpc-tip');
    const tipId = `cpcTip_${Math.random().toString(36).slice(2)}`;
    tip.id = tipId;
    icon.setAttribute('aria-describedby', tipId);

    if (opts.iconHost) opts.iconHost.appendChild(wrap);
    else input.insertAdjacentElement('afterend', wrap);

    const msg = document.createElement('div');
    msg.className = 'cpc-msg';
    msg.setAttribute('aria-live', 'polite');
    if (opts.messageHost) opts.messageHost.appendChild(msg);
    else (opts.iconHost || wrap).insertAdjacentElement('afterend', msg);

    let timer = null;
    let seq = 0;
    let lastValue = null;
    let result = null;

    function show(state, title, details, path) {
      icon.className = `cpc-icon ${state}`;
      icon.style.background = state === 'checking' ? 'transparent' : COLORS[state];
      icon.style.color = COLORS[state];
      icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[state]}</svg>`;
      icon.setAttribute('aria-label', title);
      tip.innerHTML = `<b>${esc(title)}</b>${details ? esc(details) : ''}${path ? `<div style="margin-top:6px;opacity:.75">Geprüfter Pfad: <code>${esc(path)}</code></div>` : ''}`;
      msg.textContent = state === 'checking' ? '' : title;
      msg.style.color = state === 'ok' ? COLORS.ok : state === 'checking' ? '' : COLORS[state];
      input.setAttribute('aria-invalid', state === 'error' ? 'true' : 'false');
    }

    async function run() {
      const value = input.value.trim();
      lastValue = value;
      const mine = ++seq;
      show('checking', 'Wird geprüft…', '', '');
      let res;
      try {
        res = await opts.check(value);
      } catch (err) {
        res = { status: 'error', message: 'Prüfung fehlgeschlagen', details: err.message || '' };
      }
      if (mine !== seq) return result; // a newer check is running
      result = res && res.status ? res : { status: 'error', message: res?.error || 'Prüfung fehlgeschlagen' };
      show(result.status, result.message, result.details, result.path);
      return result;
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, 600);
    }

    input.addEventListener('input', schedule);
    input.addEventListener('blur', () => {
      if (input.value.trim() !== lastValue) { clearTimeout(timer); run(); }
    });

    run();
    return { run, get result() { return result; } };
  }

  return { attach };
})();

window.CumuPathCheck = CumuPathCheck;
