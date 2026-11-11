# cumu v0.6.0-alpha — Album Covers, Smarter Discover & a Faster App

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

---

## 🖼️ Automatic Album Covers

- **Albums without a cover now get one automatically.** cumu first uses the artwork embedded in your audio files, then looks the album up in the **Cover Art Archive (MusicBrainz)**.
- **Covers are downloaded once and served by cumu itself.** Your devices never contact an outside service, and covers keep working offline. Existing covers are never replaced.
- **Own cover folder.** Covers are stored in their own folder (admin setting, default `data/covers`) instead of your music folder. Older covers in the music folder still work and are moved over when you set the folder.
- **Part of the library scan.** A scan now adds missing covers after the metadata lookup. It continues after a restart and pauses for 30 minutes after repeated network errors. The first scan of a new installation no longer blocks the app while covers are added.
- **Admin controls:**
  - *Server Config:* cover folder, automatic covers and online search on/off.
  - *Scan Library:* cover status, "load missing covers" and "retry".
  - *Albums:* "find cover" and "remove cover" per album.
- **Existing installations:** covers stay off until an admin picks the cover folder in a one-time notice, which can start the cover scan right away. New installations get covers from the start.
- **Upload fix:** embedded artwork is saved once per album instead of once per song.

## 🔎 Smarter, Typo-Tolerant Search

- **Typos no longer matter.** "the weekend" finds *The Weeknd*, "metalica" finds *Metallica*, "blindng lights" finds *Blinding Lights*. Accents, punctuation and a missing "The" are ignored too ("beyonce" → *Beyoncé*, "acdc" → *AC/DC*).
- **Ranked results with a top result.** Exact matches beat prefixes, prefixes beat partial and fuzzy matches. The best match is shown big at the top; for an artist, their most popular songs appear right next to it.
- **No more song floods.** Searching for an artist shows the artist first, not 20 of their songs. The song list stays short with a *Show all* button.
- Search across several fields works too, e.g. "blinding lights weeknd" or "rammstein sonne".

## 🎧 Discover Improvements

- New **Most Played Albums** section: the albums you listened to most in the last 3 months. With too little listening history yet, it shows **Recently Added Albums** instead.
- **Every genre has its own colour.** Each of the 100 genres has a distinct colour, and custom genres get a stable colour derived from their name.
- **Podcasts in the search fixed.** They now show as normal-sized cards side by side.
- **Long names stay inside their tiles.** Titles, artist and album names end with "…"; on phones they get up to two lines first.

## ❤️ Favourites Everywhere

- **Favourites are now stored on the server** and shared between the web app and the Android app. Existing favourites in the web app are uploaded once automatically.
- Changes in one app show up in the other right away.

## 📱 Android App

- **Much faster home and library.** Both show the last state immediately and update quietly in the background. The start page now needs one small request instead of five full-library downloads.
- **Library:** albums of the last 3 months, all playlists (pinned ones first) and a new **Lieblingssongs** entry and screen.
- **Heart button in the player** and "Zu Lieblingssongs" in the song menu.
- **Home:** "Deine Top-Alben" once there is enough listening history.
- Still works with older servers (up to v0.5.x) using the previous requests.

## ⚡ Server Performance

- New database indexes for songs, play history and playlists: album/artist counts and history lookups no longer scan whole tables.
- `/api/home` delivers the whole start page in one answer, new `/api/library/overview`, favourites API (`GET/PUT/DELETE /api/favorites`), and a faster `/api/artists`.
- The service worker no longer caches admin API answers.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
- **Android:** install the new `cumu_0.6.0-alpha.apk` from this release for the faster library and favourites.

After updating, reload the web app once (the offline cache is refreshed automatically). On existing installations, open the admin panel and choose a cover folder to turn on automatic covers.
