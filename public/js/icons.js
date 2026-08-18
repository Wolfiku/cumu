/**
 * public/js/icons.js
 * Klassik Design System Icon Engine.
 */

'use strict';

const CumuIcons = (() => {
  let _theme = 'klassik';

  // ── Klassik: Clean vector inline SVG icons ─────────────────────────────────
  const klassik = {
    home:     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M7 18v-5h6v5"/></svg>`,
    search:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="9" cy="9" r="5.5"/><path d="M17 17l-3.5-3.5"/></svg>`,
    library:  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="3" y="4" width="3" height="13" rx="0.5"/><rect x="8" y="4" width="3" height="13" rx="0.5"/><path d="M14 4l3.5 12.5" stroke-linecap="round"/></svg>`,
    play:     `<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M7 4l10 6-10 6V4z"/></svg>`,
    pause:    `<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><rect x="5" y="3" width="3.5" height="14" rx="1"/><rect x="11.5" y="3" width="3.5" height="14" rx="1"/></svg>`,
    prev:     `<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M4 5h2v10H4zM18 5L8 10l10 5V5z"/></svg>`,
    next:     `<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M16 5h2v10h-2zM2 5l10 5L2 15V5z"/></svg>`,
    settings: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="10" cy="10" r="2.5"/><path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.4 4.4l1.06 1.06M14.54 14.54l1.06 1.06M4.4 15.6l1.06-1.06M14.54 5.46l1.06-1.06"/></svg>`,
    admin:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M10 2l2 4h4l-3 3 1.5 4.5L10 11l-4.5 2.5L7 9 4 6h4l2-4z"/></svg>`,
    download: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 16h14"/></svg>`,
    shuffle:  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 6h3l2.5 4L6 14H3M17 6l-4 4 4 4"/><path d="M17 6h-3l-1 1.5M17 14h-3l-1-1.5"/></svg>`,
    repeat:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M4 10V7a2 2 0 012-2h9M16 10v3a2 2 0 01-2 2H5"/><path d="M12.5 3.5L15 6l-2.5 2.5M7.5 16.5L5 14l2.5-2.5"/></svg>`,
    volume:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M11 4l-5 4H3v4h3l5 4V4z"/><path d="M15 7.5a4.5 4.5 0 010 5M17.5 5.5a8 8 0 010 9"/></svg>`,
    heart:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M10 16.5S3 12 3 7a4 4 0 017-2.65A4 4 0 0117 7c0 5-7 9.5-7 9.5z"/></svg>`,
    close:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M5 5l10 10M15 5L5 15"/></svg>`,
    menu:     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M3 5h14M3 10h14M3 15h14"/></svg>`,
    add:      `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M10 4v12M4 10h12"/></svg>`,
    trash:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 6h14M8 6V4h4v2M5 6l1 11h8l1-11"/></svg>`,
    edit:     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M14 3l3 3L7 16H4v-3L14 3z"/></svg>`,
    more:     `<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><circle cx="5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>`,
    scan:     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M3 7V4h3M14 4h3v3M3 13v3h3M14 18h3v-3"/><line x1="3" y1="10" x2="17" y2="10"/></svg>`,
    queue:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 5h14M3 9h14M3 13h8M14 12l2 2 3-3"/></svg>`,
    playlist: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 5h14M3 9h14M3 13h8M14 11v6M11 14h6"/></svg>`,
    back:     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 10H5M10 15l-5-5 5-5"/></svg>`,
    album:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/></svg>`,
    artist:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="10" cy="6" r="3"/><path d="M4 17a6 6 0 0112 0"/></svg>`,
    music:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M7 14V4l8-2v10"/><circle cx="5" cy="14" r="2"/><circle cx="13" cy="12" r="2"/></svg>`,
  };

  const sets = { klassik };

  function setTheme(theme) {
    _theme = 'klassik';
  }

  function get(name) {
    return klassik[name] || `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/><line x1="10" y1="14" x2="10" y2="14"/></svg>`;
  }

  function getAll() {
    return Object.keys(klassik);
  }

  return { setTheme, get, getAll };
})();

window.CumuIcons = CumuIcons;
