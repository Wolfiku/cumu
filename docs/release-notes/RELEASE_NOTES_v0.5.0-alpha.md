# cumu v0.5.0-alpha — Native Android App & Login Protection

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

---

## 📱 New: Native Android App

A real Android app (Kotlin, Jetpack Compose, Media3) instead of the old web view. Download **`cumu_0.5.0-alpha.apk`** below and install it on your phone (allow "install unknown apps" for your browser or file manager once).

- **Real streaming.** Songs start instantly and can be seeked (HTTP Range). FLAC and ALAC play natively.
- **Background playback.** Music keeps playing with the screen off, with controls in the notification, on the lock screen, and via Bluetooth/headset buttons. Unplugging headphones pauses.
- **Works offline.** The app keeps the library from your last visit: home, library, playlists, albums, artists and search all work without a connection. Downloaded songs play offline; others are dimmed. A bar at the bottom shows when you are offline.
- **Downloads.** Save songs, albums or playlists to the phone. The library shows next to every playlist and album whether it is downloaded.
- **Home screen** with quick picks, recommended new songs, "Neu für dich" album, mixes (random, top hits, per genre), new albums and your artists.
- **Search** with search history, top result and filters (songs, albums, artists, playlists).
- **Artist pages** with picture, popular songs, albums and all songs.
- **Playlists:** create, add songs (new picker sheet), remove songs, delete.
- **Login** with server address, user name and password. Admins enter the admin code once; the phone remembers it for 30 days. Only tokens are stored, never the password.
- Black-and-white design with the cumu cow as app icon, plus animations throughout.

Works with every server from v0.4.3 on, no server changes needed. Requires Android 8.0 or newer.

## 🔐 Brute-Force Protection for Logins

- **Failed logins are limited.** After 5 failed attempts for an account from the same IP, that account is locked for this IP for 1 minute, doubling with every further failure (max. 15 minutes). After 20 failures from one IP within 15 minutes the whole IP is blocked.
- Covers the web login, the app login, the admin code in the first-time setup and "change password". Wrong admin codes count as failures.
- Locked requests get `429 Too Many Requests` with the waiting time, which the login forms show. Locks appear in **Admin → Logs**.
- Response times no longer reveal whether a user name exists.
- **Behind a reverse proxy** (nginx, Caddy, Traefik, Nginx Proxy Manager …) set the new `TRUST_PROXY` setting (e.g. `TRUST_PROXY=1`), so the limit counts the real client IP instead of the proxy's.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
- **Android:** install the new APK over the old one.
