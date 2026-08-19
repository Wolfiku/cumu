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

## 🚀 Quick Start (Docker)

Get **cumu** up and running in seconds with zero manual setup required:

```bash
# 1. Clone repository
git clone https://github.com/Wolfiku/cumu.git
cd cumu

# 2. Run with Docker Compose
docker compose up -d

# (Optional) If port 3000 is already in use, specify a custom port in terminal:
PORT=3001 docker compose up -d
```

Open **`http://localhost:3000`** (or your custom port) in your browser!
- **First-Time Setup**: Enter your own custom admin username and password on first launch.
- **Drag & Drop Import**: Drop MP3, FLAC, M4A, WAV files or folders directly into your browser window or drop them into `./music` on your host.
- **Auto-Updates**: Integrated **Watchtower** automatically checks for and applies new container releases in the background.

---

## ✨ Key Features

```
[+] Interactive Setup Wizard     — create your custom admin account on first launch
[+] Custom Port Support          — specify PORT=3001 directly in terminal or .env
[+] Instant Drag & Drop Import   — drop audio files or full folders into browser UI or ./music
[+] Recursive Library Scanner    — auto-scans nested subdirectories (Artist/Album/Song.mp3)
[+] Watchtower Auto-Updates      — background container updates from GitHub with zero downtime
[+] Podcast Search & Player      — search millions of shows/episodes, manage feeds & progress
[+] PWA & Offline Mode           — save playlists offline for playback without internet
[+] Multi-Format Audio           — MP3, FLAC, M4A, AAC, WAV, OGG, OPUS, ALAC support
[+] Embedded Artwork Extraction  — auto-extracts ID3 album covers or upload custom JPG/PNG
[+] Audio Seeking & Range Stream — HTTP Range requests for instant scrubbing
[+] Playlists & Library          — manage playlists, favorite songs, albums, and artists
[+] Theme Engine                 — multiple built-in UI themes (Coddy, Material 3, Klassik)
[+] 100% Self-Hosted & Private   — SQLite backend, no cloud dependency, no telemetry
```

---

## 🐳 Docker Installation & Usage Guide

### 1. Running with Docker Compose (Recommended)

`docker-compose.yml` comes pre-configured with everything you need:

```yaml
services:
  cumu:
    build: .
    image: ghcr.io/wolfiku/cumu:latest
    container_name: cumu
    restart: unless-stopped
    ports:
      - "${PORT:-${CUMU_PORT:-3000}}:3000"
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET:-cumu-default-production-secret-change-me}
      - MUSIC_PATH=/music
    volumes:
      - cumu_data:/app/data
      - ${MUSIC_PATH:-./music}:/music
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  watchtower:
    image: containrrr/watchtower:latest
    container_name: cumu_watchtower
    restart: unless-stopped
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=300
      - WATCHTOWER_LABEL_ENABLE=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

volumes:
  cumu_data:
    driver: local
```

#### Launching the Container:
```bash
# Default port 3000:
docker compose up -d

# Custom port (e.g. 3001 if port 3000 is occupied):
PORT=3001 docker compose up -d
```

### 1b. Offline Docker Image Import (From GitHub Release Assets)

If you don't have internet access or want to install directly from a downloaded release asset:

1. Download **`cumu_docker_image.tar.gz`** from the [GitHub Releases](https://github.com/Wolfiku/cumu/releases) assets. *(Do **not** use the `.deb` file with `docker load`!)*
2. Load the Docker image archive:
   ```bash
   docker load -i cumu_docker_image.tar.gz
   ```
3. Run the container:
   ```bash
   docker run -d -p 3000:3000 --name cumu -v cumu_data:/app/data cumu:latest
   ```

---

### 2. Default Login Credentials

| Username | Default Password | Notes |
|---|---|---|
| `admin` | `admin` | Auto-created on first start. Change password anytime in **Settings**. |

> **Single-User Auto-Login**: When accessing `http://localhost:3000` for the first time, cumu automatically authenticates your session as `admin` so you can start listening immediately.

---

### 3. Drag & Drop Music Import

There are **two ways** to import music into cumu:

1. **Browser Web UI (Any Device)**:
   - Drag single audio files, multiple tracks, or entire folders directly onto the browser window.
   - A drop overlay will appear automatically. Files will be uploaded, metadata extracted, and your library refreshed in real time.
2. **Host Directory (`./music`)**:
   - Copy or drop your audio files/folders directly into the `./music` directory on your host machine.
   - The background scanner automatically indexes new files recursively every 30 seconds.

---

### 4. Automatic Container Updates (Watchtower)

`cumu` includes **Watchtower** integration out of the box. Watchtower monitors GitHub for new container releases every 5 minutes and automatically updates your container without losing your database or session data.

To trigger a manual update:
```bash
docker compose pull
docker compose up -d --build
```

---

## 💻 Manual Installation (Node.js)

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | >= 18.0.0 |
| npm | >= 8.0.0 |
| FFmpeg | Required for audio metadata extraction (`apk add ffmpeg` / `apt install ffmpeg`) |

### Steps

```bash
# 1. Clone repository
git clone https://github.com/Wolfiku/cumu.git
cd cumu

# 2. Install dependencies
npm install

# 3. (Optional) Copy environment template
cp .env.example .env

# 4. Start the server
node src/server.js
```

App will start at **`http://localhost:3000`**.

---

## ⚙️ Environment Variables & Configuration

You can customize runtime settings via `.env` or Docker environment variables:

| Variable | Default | Description |
|---|---|---|
| `CUMU_PORT` | `3000` | HTTP port server listens on |
| `HOST` | `0.0.0.0` | Network interface binding address |
| `AUTO_SETUP` | `true` | Auto-creates default admin user if database is empty |
| `ADMIN_USER` | `admin` | Default admin username for auto-setup |
| `ADMIN_PASS` | `admin` | Default admin password for auto-setup |
| `SESSION_SECRET` | *(auto-generated)* | Secret key used for signing session cookies |
| `MUSIC_PATH` | `./music` | Path to host music storage folder |
| `MAX_STORAGE_GB` | `50` | Maximum library storage quota in GB |
| `DB_PATH` | `./data/cumu.db` | Path to SQLite database file |

---

## 📡 Reverse Proxy Setup (Nginx Example)

If running behind Nginx, configure WebSocket support and client body limits:

```nginx
server {
    listen 80;
    server_name music.example.com;

    client_max_body_size 1000M;

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

---

## 📖 API Reference

### Auth
- `POST /auth/login` — Session login
- `POST /auth/logout` — Session logout
- `GET /auth/me` — Get current authenticated user details

### Music & Library
- `GET /api/songs` — List all songs
- `GET /api/albums` — List all albums
- `GET /api/artists` — List all artists
- `GET /api/playlists` — List user playlists
- `POST /api/upload` — Upload audio files via Drag & Drop / Form
- `GET /stream/:songId` — Stream audio with HTTP Range support

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for more information.

