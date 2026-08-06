# cumu

> A self-hosted music streaming application built with Node.js — own your music, own your data.

```
  ██████╗██╗   ██╗███╗   ███╗██╗   ██╗
 ██╔════╝██║   ██║████╗ ████║██║   ██║
 ██║     ██║   ██║██╔████╔██║██║   ██║
 ██║     ██║   ██║██║╚██╔╝██║██║   ██║
 ╚██████╗╚██████╔╝██║ ╚═╝ ██║╚██████╔╝
  ╚═════╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝
```

---

## Quick Install

```bash
# 1. Clone
git clone https://github.com/Wolfiku/cumu.git
cd cumu

# 2. Install dependencies
npm install

# 3. Start
node src/server.js
```

On first start, cumu binds to **http://localhost:3000** by default and redirects you straight to the setup wizard. No config files needed — everything is configured in the browser.

> To change the port, set `PORT=XXXX` in a `.env` file before starting.

---

## Features

```
[+] First-time setup wizard          — configure everything in the browser
[+] MP3 / AAC / ALAC / FLAC support  — broad audio format compatibility
[+] Album upload (bulk)              — drop an entire album folder at once
[+] Single song upload               — with manual metadata override
[+] Embedded cover art extraction    — reads artwork directly from audio tags
[+] External cover image upload      — attach a JPG/PNG as album artwork
[+] Audio streaming with seek        — HTTP Range requests for instant scrubbing
[+] Spoken word mode                 — 15-second forward/backward skip (audiobooks, podcasts)
[+] Playlists                        — create, manage, add/remove songs
[+] Library                          — save favourite songs and albums
[+] Search                           — full-text across songs, albums, artists, playlists
[+] Recommendations                  — recently played, most played, newest additions
[+] Artist pages                     — all albums and songs per artist
[+] Album pages                      — tracklist with cover art, play-all button
[+] Now Playing page                 — full-screen view with 3-dot action menu
[+] Song info / edit pages           — metadata detail and admin edit view
[+] User management                  — admin can create/delete users and assign roles
[+] Storage limit                    — configurable max library size with live progress bar
[+] Responsive design                — works on mobile and desktop
[+] No external services             — 100% self-hosted, no cloud dependency
```

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | >= 18.0.0 |
| npm | >= 8.0.0 |
| OS | Linux, macOS, Windows |
| Disk | Depends on your music library |

> SQLite is used as the database — no separate database server needed.

---

## Installation

**1. Clone the repository**

```bash
git clone https://github.com/Wolfiku/cumu.git
cd cumu
```

**2. Install dependencies**

```bash
npm install
```

**3. (Optional) Configure environment**

```bash
cp .env.example .env
# edit .env if you want a different port or music path
```

**4. Start the server**

```bash
node src/server.js
```

Or with auto-reload during development:

```bash
npm run dev
```

**5. Open the app**

```
http://localhost:3000
```

On first start you will be redirected to the setup wizard automatically.

> **Default port is 3000.** To use a different port, set `PORT=XXXX` in `.env`.

---

## First-Time Setup

When you open cumu for the first time, a setup wizard guides you through:

```
[+] Admin account     — choose a username and a strong password
[+] Server settings   — port (default: 3000) and bind address (default: 0.0.0.0)
[+] Music library     — absolute path where your audio files will be stored
[+] Storage limit     — maximum total size of the music library in GB
```

After submitting, the server saves everything to the SQLite database and redirects you into the app. No restart required.

> **Tip:** If you want to redo the setup, delete `data/cumu.db` and restart the server.

---

## Usage

### Navigation (bottom bar)

| Tab | Description |
|---|---|
| `[~]` home | Recommendations: recently played, most played, new additions |
| `[?]` search | Search across songs, albums, artists and playlists |
| `[=]` library | Your saved songs, albums and playlists |

### Playing music

- **Click any song row** to start playing immediately.
- The **Now Playing bar** appears at the bottom (above the nav).
- **Click the Now Playing bar** to open the full-screen Now Playing view.
- The **three-dot menu** (`…`) on any song or in the Now Playing view gives you:
  - Add to playlist
  - Save to library
  - View song info
  - View album / artist
  - Edit (admin/creator only)

### Spoken word mode (audiobooks & podcasts)

Songs marked as *spoken word* use a different player layout:

```
  ◀15    [▶]    15▶
```

Instead of skip-to-next/previous, the buttons jump **15 seconds** forward or backward within the current track.

Normal songs use the standard layout:

```
  [◀◀]   [▶]   [stop]   [▶▶]
```

### Playlists

1. Go to **library** → click **[+] playlist**
2. Enter a name and optional description
3. Open any song's context menu (`…`) → **add to playlist**
4. Open the playlist page to play or delete

---

## Admin Panel

Access via the **admin** button in the top navigation bar (visible to admin and creator roles only).

### Upload

```
[+] drag & drop    — drop one or multiple audio files onto the upload zone
[+] click to browse — standard file picker, supports multi-select
[+] metadata override — manually set artist, album, title before uploading
[+] cover image    — attach a JPG/PNG as album artwork
[+] spoken word flag — mark the upload batch as audiobook/podcast
```

Supported audio formats: `.mp3` `.m4a` `.aac` `.flac` `.ogg` `.wav`

Metadata is extracted automatically from ID3/Vorbis tags. Manual fields override the extracted values.

### Songs tab

- Lists every song in the library
- **edit** — opens the song edit page (title, genre, year, track number, spoken word flag)
- **del** — permanently deletes the song and removes the file from disk

### Albums tab

- Grid view of all albums with cover art
- **delete album** — removes the album and all its songs from disk

### Users tab *(admin only)*

- Lists all registered users with their role
- **[+] new user** — creates a user with a chosen role
- **del** — removes a user (cannot delete yourself)

### Stats tab

```
songs     albums     artists     users

storage used: 2.31 / 50 GB  [████░░░░░░] 4%
```

---

## User Roles

| Role | Permissions |
|---|---|
| `user` | Stream music, create playlists, save to library, view all pages |
| `creator` | Everything a user can do + upload music, edit song metadata, delete songs/albums |
| `admin` | Everything a creator can do + manage users, view stats, full admin panel |

---

## API Reference

All API endpoints require an active session (login first via `POST /auth/login`).

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/setup` | Complete first-time setup |
| `POST` | `/auth/login` | Log in |
| `POST` | `/auth/logout` | Log out |
| `GET`  | `/auth/me` | Get current user info |

### Songs

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/songs` | List all songs |
| `GET`  | `/api/songs/:id` | Get a single song |
| `POST` | `/api/songs/:id/play` | Record a play (increments counter) |
| `PUT`  | `/admin/songs/:id` | Edit song metadata *(admin/creator)* |
| `DELETE` | `/admin/songs/:id` | Delete song + file *(admin/creator)* |

### Albums

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/albums` | List all albums |
| `GET`  | `/api/albums/:id` | Album detail + tracklist |
| `DELETE` | `/admin/albums/:id` | Delete album + all songs *(admin/creator)* |

### Artists

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/artists` | List all artists |
| `GET`  | `/api/artists/:id` | Artist detail + albums + songs |

### Playlists

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/playlists` | List user's playlists |
| `POST` | `/api/playlists` | Create playlist |
| `GET`  | `/api/playlists/:id` | Playlist detail + songs |
| `POST` | `/api/playlists/:id/songs` | Add song to playlist |
| `DELETE` | `/api/playlists/:id/songs/:songId` | Remove song from playlist |
| `DELETE` | `/api/playlists/:id` | Delete playlist |

### Upload & Stream

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/upload` | Upload audio files (multipart/form-data) |
| `GET`  | `/stream/:songId` | Stream audio (supports Range header) |
| `GET`  | `/stream/cover/:filename` | Serve cover art image |

### Home / Search / Library

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/home` | Recommendations (recent, popular, new) |
| `GET`  | `/api/search?q=...` | Search songs, albums, artists, playlists |
| `GET`  | `/api/library` | User's saved songs, albums, playlists |
| `POST` | `/api/library/song` | Save a song to library |

### Admin

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/stats` | Library statistics *(admin)* |
| `GET`  | `/api/users` | List users *(admin)* |
| `POST` | `/api/users` | Create user *(admin)* |
| `DELETE` | `/api/users/:id` | Delete user *(admin)* |

---

## Configuration

All configuration is stored in the SQLite database after setup. You can also use a `.env` file to pre-set some values:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Bind address |
| `SESSION_SECRET` | *(auto-generated)* | Secret for session signing |
| `MUSIC_PATH` | `./music` | Path to store audio files |
| `MAX_STORAGE_GB` | `50` | Max library size in GB |
| `DB_PATH` | `./data/cumu.db` | SQLite database path |

> Values in `.env` are used as **fallback defaults** only. The setup wizard always takes precedence.

### Running on a VPS / behind a reverse proxy

If you run cumu behind Nginx or Caddy, set `HOST=127.0.0.1` and proxy to the chosen port:

```nginx
server {
    listen 80;
    server_name music.example.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Running with PM2 (auto-restart)

```bash
npm install -g pm2
pm2 start src/server.js --name cumu
pm2 save
pm2 startup
```

---

## Project Structure

```
cumu/
├── src/
│   ├── server.js           # Express app, middleware, routing
│   ├── db.js               # SQLite schema, getDB(), getConfig(), setConfig()
│   └── routes/
│       ├── auth.js         # /auth — login, logout, setup, /me
│       ├── api.js          # /api  — songs, albums, artists, playlists, search, home
│       ├── admin.js        # /admin — upload (multer), edit, delete
│       └── stream.js       # /stream — audio range streaming, cover art serving
├── public/
│   ├── index.html          # SPA shell (nav, now-playing bar, login modal)
│   ├── setup.html          # First-run setup wizard
│   ├── css/
│   │   └── style.css       # Full design system (OpenCode-inspired)
│   └── js/
│       └── app.js          # SPA logic (routing, audio engine, all views)
├── data/                   # Auto-created — SQLite DB + session store
├── music/                  # Default music storage (configurable)
├── .env.example            # Environment variable template
├── package.json
├── LICENSE
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Web framework | Express 4 |
| Database | SQLite via `better-sqlite3` |
| Session store | `connect-sqlite3` |
| Audio metadata | `music-metadata` |
| File upload | `multer` |
| Auth | `bcryptjs` + session cookies |
| Frontend | Vanilla JS SPA (no framework) |
| Fonts | JetBrains Mono (Google Fonts) |
| Design system | Based on OpenCode DESIGN.md |

---

## License

MIT — see [LICENSE](./LICENSE) for details.
