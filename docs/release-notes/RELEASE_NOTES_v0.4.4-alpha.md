# cumu v0.4.4-alpha — NAS Installation

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

This release makes cumu installable on NAS systems and fixes several installer problems.

---

## 🗄️ NAS Support (Synology, QNAP, Unraid, TrueNAS SCALE, Asustor)

- **The one-line installer now works on NAS systems.** It detects the NAS and installs cumu plus Watchtower as Docker containers, instead of failing with "Cannot detect OS".
- **Sensible defaults per NAS.** The installer suggests suitable folders for data and music (e.g. Synology `/volume1/docker/cumu` and `/volume1/music`, Unraid `/mnt/user/appdata/cumu`). Press Enter to accept or type your own.
- **No compose plugin needed.** Containers are started with plain `docker run`, so it also works where Docker Compose is missing (e.g. Unraid).
- **Admin code shown at the end.** It is stored in `<data folder>/cumu.env` and kept on re-install.
- **Other systems:** NAS devices without a supported package manager but with Docker (e.g. TerraMaster, UGREEN) are installed as containers automatically. On any Linux you can force this with `--docker`; folders can be set with `--data-dir` and `--music-path`.
- **New [`docker-compose.nas.yml`](https://github.com/Wolfiku/cumu/blob/main/docker-compose.nas.yml)** for NAS container UIs (Container Manager, Container Station, Portainer, TrueNAS Apps), with the matching paths for each NAS in its header.

### Install on a NAS

1. Install and start your NAS's Docker package (Synology: Container Manager, QNAP: Container Station, Unraid: enable Docker, TrueNAS SCALE: set up Apps, Asustor: Docker-CE).
2. Enable SSH, log in and become root: `sudo -i`
3. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

Not supported: TrueNAS CORE (FreeBSD) and 32-bit ARM NAS models (the image is built for x86_64 and arm64).

## 🛠️ Installer Fixes

- **Clearer root check.** It now uses `id -u` and says which user the script is actually running as. It also explains the common mistake `sudo curl … | bash` (only `curl` runs as root, not `bash`).
- **Better OS detection.** Derivatives such as Raspberry Pi OS, KDE neon, EndeavourOS or Amazon Linux are recognised via `ID_LIKE`, with fallbacks to `/usr/lib/os-release`, release files and the installed package manager.
- **Installer no longer stops before the summary** on systems without `hostname -I`. Before, it could exit silently before showing the URL and admin code.
- The cumu logo in the installer is now white.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
