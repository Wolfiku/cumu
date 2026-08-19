# cumu

> A lightweight, self-hosted music & podcast streaming server — own your music, own your data.

```
  ██████╗██╗   ██╗███╗   ███╗██╗   ██╗
 ██╔════╝██║   ██║████╗ ████║██║   ██║
 ██║     ██║   ██║██╔████╔██║██║   ██║
 ██║     ██║   ██║██║╚██╔╝██║██║   ██║
 ╚██████╗╚██████╔╝██║ ╚═╝ ██║╚██████╔╝
  ╚═════╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝
```

---

## 🚀 Quick Start (One-Line Installer)

Get **cumu** installed and running on Linux (Debian, Ubuntu, Proxmox LXC, Fedora, Arch) in seconds:

```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

*(Note: If you are logged in as `root`, do not add `sudo` before the command.)*

> 📖 **Looking for Docker Compose, Debian `.deb` packages, or offline archives?**  
> Check out the complete [**INSTALL.md**](INSTALL.md) guide for all alternative deployment methods.

---

## ✨ Key Features

```
[+] Interactive Setup Wizard     — create your custom admin account on first launch
[+] Custom Port Support          — specify custom server port during install, in web setup, or via env
[+] Automated Daily Updates      — auto-updates via cron (Linux) & Watchtower (Docker)
[+] Admin Update Dashboard       — check for and trigger system updates directly in the web UI
[+] Instant Drag & Drop Import   — drop audio files or full folders into browser UI or ./music
[+] Recursive Library Scanner    — auto-scans nested subdirectories (Artist/Album/Song.mp3)
[+] Podcast Search & Player      — search millions of shows/episodes, manage feeds & progress
[+] PWA & Offline Mode           — save playlists offline for playback without internet
[+] Multi-Format Audio           — MP3, FLAC, M4A, AAC, WAV, OGG, OPUS, ALAC support
[+] Embedded Artwork Extraction  — auto-extracts ID3 album covers or upload custom JPG/PNG
[+] Audio Seeking & Range Stream — HTTP Range requests for instant scrubbing
[+] Playlists & Library          — manage playlists, favorite songs, albums, and artists
[+] Modern Theme Engine          — clean, minimalist Studio Environment design system
[+] 100% Self-Hosted & Private   — SQLite backend, no cloud dependency, no telemetry
```

---

## ⚙️ Environment Variables

Customize runtime settings via `.env` or environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port server listens on |
| `HOST` | `0.0.0.0` | Network interface binding address |
| `SESSION_SECRET` | *(auto-generated)* | Secret key used for signing session cookies |
| `MUSIC_PATH` | `./music` | Path to host music storage folder |
| `MAX_STORAGE_GB` | `50` | Maximum library storage quota in GB |
| `DB_PATH` | `./data/cumu.db` | Path to SQLite database file |

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for more information.
