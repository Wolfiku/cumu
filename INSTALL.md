# cumu — Installation Guide

This document covers all available methods for installing and deploying **cumu**.

---

## 🚀 1. One-Line Installer (Recommended for Linux / Bare Metal / LXC)

The recommended installation method for Debian, Ubuntu, Proxmox LXC, Fedora, and Arch Linux. It automatically installs Node.js (if missing), sets up `cumu` as a `systemd` background service, configures daily auto-updates, and creates the `cumu-update` CLI tool.

```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

*(Note: If you are already logged in as `root`, do not include `sudo`.)*

### Custom Options:
You can pass custom arguments to the installer:
```bash
# Specify custom port and music path
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash -s -- --port 8080 --music-path /srv/music
```

### Managing the Service:
- **Check Status**: `systemctl status cumu`
- **View Logs**: `journalctl -u cumu -f`
- **Update Manually**: `cumu-update`

---

## 🐳 2. Docker Compose (Container Deployment)

Ideal for environments running Docker & Docker Compose. Includes integrated **Watchtower** for automatic background updates.

```bash
# 1. Clone repository
git clone https://github.com/Wolfiku/cumu.git
cd cumu

# 2. Start containers
docker compose up -d
```

### Custom Port (Docker):
```bash
PORT=3001 docker compose up -d
```

### `docker-compose.yml` Configuration:
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

---

## 📦 3. Debian Package (`.deb`)

For Debian-based systems requiring native package management.

1. Download the latest `.deb` package from [GitHub Releases](https://github.com/Wolfiku/cumu/releases).
2. Install via `dpkg`:
```bash
dpkg -i cumu_0.2.0-alpha_amd64.deb
```

---

## 💾 4. Offline Docker Image Archive (`.tar.gz`)

For air-gapped environments or offline servers:

1. Download `cumu_docker_image.tar.gz` from [GitHub Releases](https://github.com/Wolfiku/cumu/releases).
2. Import and run:
```bash
docker load -i cumu_docker_image.tar.gz
docker run -d -p 3000:3000 -v cumu_data:/app/data --name cumu ghcr.io/wolfiku/cumu:latest
```
