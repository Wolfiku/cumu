# cumu v0.2.0 | installation Update

This release brings significant improvements to installation, automatic updates, multi-architecture container support, and the admin dashboard.

---

## Highlights & New Features

- **Prioritized One-Line Installer:**
  Streamlined bare-metal installation script for Debian, Ubuntu, Proxmox LXC, Fedora, and Arch. Automatically configures Node.js 20+, systemd background service, and daily background updates.
  ```bash
  curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
  ```

- **Daily Automated Background Updates:**
  - **Bare Metal / LXC**: Automated daily cronjob (`/etc/cron.daily/cumu-update`). Includes `cumu-update` CLI tool.
  - **Docker**: Integrated Watchtower background container auto-pulls new container images without downtime.

- **Admin Dashboard Update Button:**
  Added a new **System Update & Version** section in Admin Settings & Stats with the button **"Jetzt auf Updates prüfen & aktualisieren"**.

- **Automated Path & Permission Validation:**
  Server automatically validates read/write permissions on the configured music storage directory prior to saving.

- **Interactive Port & Setup Wizard:**
  Custom server port support during terminal installation and in the redesigned web setup wizard.

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
dpkg -i cumu_0.2.0_amd64.deb
```

---

## Full Documentation
See [INSTALL.md](https://github.com/Wolfiku/cumu/blob/main/INSTALL.md) for full deployment instructions.
