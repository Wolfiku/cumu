# cumu v0.4.0-alpha — Mobile Overhaul & Reliable Song Recognition

The biggest changes in this release are a **reworked mobile experience** and a **rebuilt song recognition**. This is an alpha: please report anything that looks off.

---

## 📱 Mobile Improvements

- **New phone layout** with a three-tab bottom bar (home / library / profile) and a mini player.
- **Full-screen now playing view** without app chrome.
- **Bottom sheets** for context menus and the queue.
- **Touch gestures:** drag to reorder the queue, long press opens the song menu.
- **Back button / back gesture** moves through the app instead of leaving it.
- **Profile tab** bundles settings, playlists, the admin dashboard and logout.
- Phone-sized spacing, safe-area insets on notched devices, toasts above the bars.

## 🎵 Song Recognition

- **Every scanned song is looked up.** Library scans now run the metadata lookup (MusicBrainz → Mistral AI, if configured) for each new song.
- **No more wrong matches.** The old lookup took the first search result and overwrote your tags with it; in tests most well-known songs ended up as a cover, karaoke or parody version. A match is now only used when title, artist and length agree and it is the same version (live, remix, cover, … are told apart). Uncertain songs are left as they are instead of being guessed.
- **Your tags win.** Album, year and track number from your files are never replaced, only filled in when missing. The lookup no longer sets a year at all, since a text search can't tell the original release from a remaster.
- **Untagged files** named `Artist - Title` are recognized from the file name.
- **Robust against outages:** MusicBrainz requests are rate-limited and retried; songs that could not be looked up are retried on the next scan instead of counting as "not found".

## 🔍 Library Scan

- **Scan progress with time remaining** in the sidebar (desktop) and a strip below the top bar (mobile), plus live progress in Admin → Scan Library.
- **First setup:** a fresh installation with music in its folder shows that a scan is needed. An admin starts it, and cumu opens once the library is ready.
- **Runs on the server:** closing the browser does not stop a scan, and an interrupted scan continues after a restart. New files are picked up automatically in the background.

## 🧹 Library Cleanup & Fixes

- Albums of different artists that share a title (e.g. "Greatest Hits") are no longer merged; already merged albums are split once on startup.
- Duplicate songs and albums are prevented and cleaned up automatically. The database is backed up before the first cleanup, and no files are deleted.
- The site-wide drag & drop upload overlay was removed (the upload area in the admin panel still accepts dropped files).
- The auto lookup toggle in the settings now shows its real state.

---

## Installation Options

### Option 1: One-Line Installer (Recommended for Linux / LXC)
```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

### Option 2: Docker Compose
```bash
git clone https://github.com/Wolfiku/cumu.git
cd cumu
docker compose up -d
```

### Option 3: Debian / Ubuntu Package (.deb)
```bash
dpkg -i cumu_0.4.0-alpha_all.deb
```

---

## Full Documentation
See [INSTALL.md](https://github.com/Wolfiku/cumu/blob/main/INSTALL.md) for full deployment instructions.
