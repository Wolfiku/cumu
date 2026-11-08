# cumu v0.4.6-alpha — Update or Reinstall, Remembered Admin Code

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

---

## 🔁 Installer: Update or Fresh Install

When cumu is already installed (Docker container or Linux service), the installer now asks what to do:

```
1) Aktualisieren        — Benutzer, Einstellungen, Bibliothek und Admin-Code bleiben
2) Komplett neu installieren — Datenbank, Benutzer und Einstellungen werden gelöscht
                               (deine Musikdateien bleiben erhalten)
3) Abbrechen
```

- **Update** reuses the data folder, music folder and port of the existing installation and asks no further questions.
- **Fresh install** must be confirmed by typing `ja`, and a new admin code is created. **Music files are never deleted.**
- Without a terminal it updates. To skip the question, use `--update` or `--reinstall`.
- The terminal check now also works reliably with `curl … | bash`.

## 🔐 Admin Code Only Every 30 Days

- After you enter the admin code once on a device (also in the first-time setup), that device remembers it for **30 days**. Until then, username and password are enough.
- After 30 days, or on a new device or browser, the code is asked for again.
- Changing `ADMIN_LOGIN_CODE` ends the 30 days on all devices immediately.
- The mobile app already stores the code itself; nothing changes there.

## 🧹 Shorter Folder Info in Setup

- The first-time setup no longer lists every folder that is shared with the Docker container. On Synology every shared folder is a separate mount, so the list could be 20 lines long.
- Where shared folders are still mentioned, only the top-level ones are shown, at most three (e.g. `/volume1`).

## ⬆️ Updating

Run the installer and choose **1) Aktualisieren**:

```bash
curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash
```

Admins enter the admin code once after the update; after that, the 30 days apply.
