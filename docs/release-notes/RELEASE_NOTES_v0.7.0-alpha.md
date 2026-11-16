# cumu v0.7.0-alpha — Quality of Life: Audiobooks, Crossfade & Sleep Timer

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

---

## 📚 Audiobooks

- **Automatic detection.** Every track in the genre **Speech** becomes an audiobook chapter. *Spoken Word*, *Audiobook* and *Hörbuch* count too. This covers scans, uploads, metadata lookups and edits. Existing tracks are converted on the first start.
- **Books instead of albums.** An album of chapters is one book with its own page: cover, author, length, progress, and *Continue listening*, *Start over*, *Add to queue* and *Mark as finished*. Album links to an audiobook open the book page.
- **Never between your music.** Audiobooks are left out of shuffle-all mixes, genre mixes and genre pages, *Top-Hits*, *Recently added*, *Recently played*, *Most played*, recommendations and the music search results. They only play when you start them or put them in the queue yourself, like podcasts.
- **Their own section everywhere:**
  - *Start page:* "Continue listening" (with progress) and new audiobooks.
  - *Search:* a separate "Audiobooks" section, which also finds books by chapter titles.
  - *Library:* a new **Audiobooks** category, sortable by newest, title or author.
  - *Artist pages:* the author's audiobooks.
- **Listening position on every device.** cumu saves your position in each book on the server while you listen, when you pause and when you switch chapters. The web app and the Android app continue where you stopped on the other one, a few seconds back so you find your way into the story again.
- **Audiobook player** (web and Android): previous/next chapter, **15 s back**, **30 s forward**, **playback speed 0.75× – 2×** (remembered for the next books, music always plays at 1×), a chapter list and "Chapter 3 of 12". Chapters never crossfade into each other.

## 😴 Sleep Timer (Android)

- New entry **Sleep-Timer** in the ⋮ menu of the player.
- Pause after **5, 10, 15, 30, 45, 60 or 90 minutes**, or **at the end of the current title** (in audiobooks: chapter).
- The music **fades out** over the last seconds instead of stopping abruptly.
- While the timer runs, the player shows the countdown. You can extend it by 5 minutes or turn it off.
- For audiobooks, the position is saved when the timer pauses.

## 🎚️ Seamless Playback (web and Android)

- **Skip silence (void skipping).** The silent part at the start and end of a song is skipped. The next song starts at its first sound.
- **Crossfade + skip silence combined.** The silence counts towards the fade: with 3 s of silence at the end and a 5 s crossfade, the songs fade into each other for 2 s of real sound. Without crossfade, playback cuts straight from the last sound to the next one.
- **Crossfade in the Android app** (0 – 12 s, in *Profil → Wiedergabe*). It is a real overlap: the old song keeps playing while the new one fades in, with equal-power curves (no dip in the middle).
- **Normalize volume.** Every song plays at the same loudness (target −14 LUFS, peaks kept below −1 dBTP), so no song is much louder or quieter than the others.
- **Autoplay.** When the queue is over, cumu continues with similar music (same artists and genres, similar years, nothing you just heard). Songs are added early enough for the crossfade. Never after audiobooks or podcasts, never with repeat on.
- **Shuffle crossfades too** on the web: the next shuffled song is picked in advance and preloaded.
- Audiobooks and podcasts never fade, skip or autoplay.
- **Server analysis:** cumu analyses every music track once in the background with **ffmpeg** (silence at start and end, EBU R128 loudness and true peak). New tracks are analysed after scans and uploads. Without ffmpeg, only ReplayGain tags are used for normalization and silence is not skipped. The Docker image already contains ffmpeg; on Linux installations `install.sh` now installs it.
- All three options can be switched off: on the web in *Settings → Audio Engine*, in the app in *Profil → Wiedergabe*.

## 📱 Android: Gestures & Queue

- **Swipe the mini player:** left for the next title, right for the previous title, down to stop and close it.
- **Reorder the queue** by dragging the ≡ handle. The list scrolls along at the edges. Autoplay songs are marked in the queue.

## 🐛 Fixes

- Settings no longer overwrite each other: `/api/sync` merges `extraSettings` instead of replacing them. Before, saving one setting could reset others, such as podcast search.

## 🔌 API

- `GET /api/audiobooks`: all books with your progress, plus the started ones (`continue`).
- `GET /api/audiobooks/:id`: a book with its chapters.
- `PUT /api/audiobooks/:id/progress` `{ songId, position, finished? }` / `DELETE /api/audiobooks/:id/progress`.
- `/api/home` gains `audiobooks`, `/api/search` and `/api/artists/:id` gain `audiobooks`, `/api/library/overview` gains `audiobookCount`.
- `/api/songs` lists music only; add `?audiobooks=1` to include the chapters.
- `GET /api/radio?seeds=<ids>&exclude=<ids>&limit=20`: similar music for autoplay.
- Songs carry `intro_silence_ms`, `outro_silence_ms`, `loudness_lufs`, `peak_db` and `loudness_gain_db` once analysed.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
- **Android:** install the new `cumu_0.7.0-alpha.apk` from this release for the sleep timer, audiobooks, crossfade, gestures and the new queue. Older app versions keep working, but they show no audiobook sections.

After updating, reload the web app once (the offline cache is refreshed automatically).
