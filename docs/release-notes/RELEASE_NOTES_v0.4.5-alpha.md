# cumu v0.4.5-alpha — Any Music Path & Live Scan Progress

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

---

## 📁 Any Music Path Works

- **No more `/app/…`.** A path entered without a leading slash (e.g. `volume1/music`) used to be read from the program folder, which is `/app` in Docker. It is now read from the root: `/volume1/music`.
- **NAS paths work in Docker.** The installer now shares your NAS drives with the container under the **same path** (Synology/Asustor `/volume1…`, QNAP `/share`, Unraid/TrueNAS `/mnt`). So you can enter the real NAS path, such as `/volume1/music`, directly in cumu. [`docker-compose.nas.yml`](https://github.com/Wolfiku/cumu/blob/main/docker-compose.nas.yml) does the same.
- **The folder you choose is the folder that gets scanned.** Before, the library scan always read `MUSIC_PATH` from the `.env` or container, whatever was entered in the settings. Once you save a folder in the setup wizard or in the settings, cumu uses it for scanning, uploads and streaming. Existing installations keep their current behaviour until the folder is saved once.
- The setup wizard pre-fills the music folder chosen in the installer.

## ✅ Live Path Check

In the setup wizard and in **Admin → Server Config**, the music folder is checked right after you type it. Nothing is changed by the check.

- **Green check:** the folder exists and contains audio files (with count).
- **Amber "!":** it can be saved, but something looks off (empty, does not exist yet, read-only).
- **Red "!":** it cannot be saved (a file instead of a folder, no read permission, or not shared with the Docker container).
- **Hover over or focus the icon** for an explanation and the exact path that was checked. A short note below the field shows it on touch devices too.
- Fixed: saving an invalid path showed "Configuration saved!" anyway.

## 📊 Scan Shows What It Is Doing

- **New first step "Ordner durchsuchen".** It shows live how many audio files were found and which folder is being searched, with a moving progress bar.
- **The server stays responsive while it searches.** On large NAS libraries, searching used to block the server, and nothing was shown for minutes.
- **Clear steps:** "Schritt 1/3 · Ordner durchsuchen", "Schritt 2/3 · Dateien einlesen" (with the current file), "Schritt 3/3 · Lieder erkennen" (with the current song).
- **The scan summary now names the folder and the number of files found.** If nothing was found, it suggests checking the music folder.

## ⬆️ Updating

- **NAS installed with v0.4.4-alpha:** run the installer again (your data and admin code are kept), then open **Admin → Server Config** and save the music folder once, e.g. `/volume1/music`.

```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

- **Other Docker installs:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
