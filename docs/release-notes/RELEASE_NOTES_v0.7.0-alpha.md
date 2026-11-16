# cumu v0.7.0-alpha — Quality of Life: Audiobooks & Sleep Timer

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

## 🔌 API

- `GET /api/audiobooks`: all books with your progress, plus the started ones (`continue`).
- `GET /api/audiobooks/:id`: a book with its chapters.
- `PUT /api/audiobooks/:id/progress` `{ songId, position, finished? }` / `DELETE /api/audiobooks/:id/progress`.
- `/api/home` gains `audiobooks`, `/api/search` and `/api/artists/:id` gain `audiobooks`, `/api/library/overview` gains `audiobookCount`.
- `/api/songs` lists music only; add `?audiobooks=1` to include the chapters.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
- **Android:** install the new `cumu_0.7.0-alpha.apk` from this release for the sleep timer and audiobooks. Older app versions keep working, but they show no audiobook sections.

After updating, reload the web app once (the offline cache is refreshed automatically).
