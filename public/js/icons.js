/**
 * public/js/icons.js
 * Theme-specific icon rendering engine.
 *
 * Each theme has its own icon set:
 *   Klassik   → Clean inline SVG icons (stroke, no fill)
 *   Coddy     → ASCII bracket glyphs (no SVG)
 *   Material3 → Material Design 3 filled rounded SVGs
 *
 * Usage:
 *   CumuIcons.get('home')       → returns HTML string for current theme
 *   CumuIcons.setTheme('coddy') → switches active icon set
 */

'use strict';

const CumuIcons = (() => {
  let _theme = 'coddy';

  // ── Klassik: clean inline SVG, 20×20, 1.5px stroke, no fill ──────────────
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
  };

  // ── Coddy: ASCII bracket glyphs ───────────────────────────────────────────
  const coddy = {
    home:     '<span class="icon-ascii">[~]</span>',
    search:   '<span class="icon-ascii">[?]</span>',
    library:  '<span class="icon-ascii">[=]</span>',
    play:     '<span class="icon-ascii">[&gt;]</span>',
    pause:    '<span class="icon-ascii">[||]</span>',
    prev:     '<span class="icon-ascii">[|&lt;]</span>',
    next:     '<span class="icon-ascii">[&gt;|]</span>',
    settings: '<span class="icon-ascii">[*]</span>',
    admin:    '<span class="icon-ascii">[#]</span>',
    download: '<span class="icon-ascii">[v]</span>',
    shuffle:  '<span class="icon-ascii">[%]</span>',
    repeat:   '<span class="icon-ascii">[@]</span>',
    volume:   '<span class="icon-ascii">[(]</span>',
    heart:    '<span class="icon-ascii">[&lt;3]</span>',
    close:    '<span class="icon-ascii">[x]</span>',
    menu:     '<span class="icon-ascii">[-]</span>',
    add:      '<span class="icon-ascii">[+]</span>',
    trash:    '<span class="icon-ascii">[d]</span>',
    edit:     '<span class="icon-ascii">[e]</span>',
    more:     '<span class="icon-ascii">[...]</span>',
    scan:     '<span class="icon-ascii">[s]</span>',
  };

  // ── Material 3: filled rounded SVGs with tonal weight ─────────────────────
  const material3 = {
    home:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
    search:   `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5a6.5 6.5 0 10-13 0 6.5 6.5 0 006.5 6.5c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
    library:  `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>`,
    play:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z"/></svg>`,
    pause:    `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    prev:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
    next:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    admin:    `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93C9.33 17.79 7 14.5 7 11V7.18L12 5z"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
    shuffle:  `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
    repeat:   `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
    volume:   `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
    heart:    `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    close:    `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    menu:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`,
    add:      `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
    trash:    `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    edit:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    more:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`,
    scan:     `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M4 4h3V2H4C2.9 2 2 2.9 2 4v3h2V4zm13-2v2h3v3h2V4c0-1.1-.9-2-2-2h-3zM4 17H2v3c0 1.1.9 2 2 2h3v-2H4v-3zm16 3h-3v2h3c1.1 0 2-.9 2-2v-3h-2v3zM5 8v8h14V8H5zm12 6H7v-4h10v4z"/></svg>`,
  };

  const sets = { klassik, coddy, material3 };

  function setTheme(theme) {
    if (sets[theme]) _theme = theme;
  }

  function get(name) {
    const set = sets[_theme] || coddy;
    return set[name] || `<span class="icon-ascii">[?]</span>`;
  }

  function getAll() {
    return Object.keys(sets[_theme] || coddy);
  }

  return { setTheme, get, getAll };
})();

window.CumuIcons = CumuIcons;
