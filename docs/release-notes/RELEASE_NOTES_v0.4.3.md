# cumu v0.4.3 — Admin Login Code & Instant Updates

This is a **security release**. Admin accounts are now protected by a second factor, and urgent updates can be installed right away, even while a library scan is running.

---

## 🔐 Admin Login Code (important — please read)

- **Every admin login needs a code.** Admins (and creators) must enter `ADMIN_LOGIN_CODE` from the server's `.env` in addition to their password: in the web app, the mobile app and during first-time setup. Normal users are not affected.
- **Generated automatically.** If the code is missing, the server creates one on startup and writes it to the `.env`:
  - **Linux / LXC / .deb:** `/opt/cumu/.env` (or your install directory)
  - **Docker:** `data/.env` inside the data volume, so it survives Watchtower updates. You can also set `ADMIN_LOGIN_CODE` yourself in the `.env` next to your `docker-compose.yml`.
  - The server log says where the code was saved.
- **All admins are logged out once** after this update and have to log in again with the code. Admin logins also end whenever the code is changed.
- **`AUTO_LOGIN` was removed.** It logged in an admin without any password. If it is still set, it is ignored and a warning is logged.

### Where do I find my code?

```bash
# Docker
docker exec cumu cat /app/data/.env
# Linux / LXC / .deb
sudo grep ADMIN_LOGIN_CODE /opt/cumu/.env
```

## ⚡ Instant Updates

- **Update during a library scan:** while a scan runs (including the full-screen first scan), admins on desktop get an **"Update installieren"** button in the bottom right corner. The page reloads when cumu is back, and the scan continues where it stopped.
- **Docker updates now really start immediately.** "Update now" in the admin panel used to only say that Watchtower updates on its own (every 5 minutes). cumu now tells Watchtower to update right away through its HTTP API.
  - **Existing Docker installations:** add the new `WATCHTOWER_*` lines from [`docker-compose.yml`](https://github.com/Wolfiku/cumu/blob/main/docker-compose.yml) once, then run `docker compose up -d`. Without them, automatic updates keep working as before.
- **Linux / LXC:** the update button now reports when `cumu-update` fails (it needs root; run `sudo cumu-update`) or when cumu is already up to date, instead of always saying "Update started".

## 🧹 Fixes

- The admin panel shows the real version instead of `v0.2.0`.

---

## Installation Options

### Option 1: One-Line Installer (Recommended for Linux / LXC)
```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```
The installer prints the admin login code at the end.

### Option 2: Docker Compose
```bash
git clone https://github.com/Wolfiku/cumu.git
cd cumu
docker compose up -d
```

### Option 3: Debian / Ubuntu Package (.deb)
```bash
dpkg -i cumu_0.4.3_all.deb
```

---

## Full Documentation
See [INSTALL.md](https://github.com/Wolfiku/cumu/blob/main/INSTALL.md) for full deployment instructions.
