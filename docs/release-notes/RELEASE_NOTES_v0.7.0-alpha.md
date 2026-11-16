# cumu v0.7.0-alpha — Quality of Life & Social: Audiobooks, Crossfade, Shared Playlists

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

## 👥 Shared Playlists (web and Android)

- **Three levels:** every playlist starts **private**. Afterwards the owner chooses in *Teilen* (web: button on the playlist page, app: share icon):
  - **Privat:** only you.
  - **Öffentlich:** everyone on this server can find it, add it to their library, download it and listen. On the start page as *Community Playlists*, and in the search.
  - **Geteilt:** only people you invite by **user name**. Each one either listens or may also add and remove songs.
- **Collaborating:** in playlists several people edit, every song shows who added it. Shared playlists appear in the library of the invited people with "von …".
- **Your library:** public playlists can be saved with one tap; invited people can leave a playlist. Only the owner can delete it, rename it or change who has access.
- "Add to playlist" offers only playlists you may edit.
- Playlists cumu creates itself stay private.

## 📨 Send Music to Other Users (web and Android)

- **Share** songs, albums, artists, playlists and audiobooks with a person on the server, with an optional message. Name suggestions appear while you type.
- **Inbox "Mit dir geteilt":** everything others sent you, with sender, message and time. Tap to play or open. A badge shows new items: live on the web, in the app on the start page and in the library.
- **Links:** every item has a link (`https://your-server/#/album/…`). It opens the item directly after login. Copy it on the web; in the app, share it with any app or copy it.
- A private playlist can only be sent once the person may open it: cumu offers to invite them in the same step.

## 🛡️ Privacy (web: Settings → Privatsphäre, app: Profil → Privatsphäre)

- **Invitations to playlists:** allow or refuse.
- **Receive shared items:** allow or refuse.
- **Appear in name suggestions:** off means others have to know your exact name.
- **Show my name on public playlists:** off means your public playlists appear without your name.
- **Count in server statistics:** off means your plays do not count for "most played" and autoplay popularity. Your own history stays.
- **Block users:** no invitations or shares in either direction, and neither sees the other's public playlists. Existing invitations between you are removed. Blocked users are not told; they see the same message as for a refused setting.
- **Delete listening history:** removes "recently played" and your personal top lists.

## 🔒 Security

- Playlists are now checked on the server: before, any signed-in user could open or change any playlist by its id. Private playlists of other users now answer "not found".

## 🐛 Fixes

- Settings no longer overwrite each other: `/api/sync` merges `extraSettings` instead of replacing them. Before, saving one setting could reset others, such as podcast search.

## 🔌 API

- `GET /api/audiobooks`: all books with your progress, plus the started ones (`continue`).
- `GET /api/audiobooks/:id`: a book with its chapters.
- `PUT /api/audiobooks/:id/progress` `{ songId, position, finished? }` / `DELETE /api/audiobooks/:id/progress`.
- `/api/home` gains `audiobooks`, `/api/search` and `/api/artists/:id` gain `audiobooks`, `/api/library/overview` gains `audiobookCount`.
- `/api/songs` lists music only; add `?audiobooks=1` to include the chapters.
- `GET /api/radio?seeds=<ids>&exclude=<ids>&limit=20`: similar music for autoplay.
- Playlists carry `visibility`, `owner_username`, `access` (`owner` / `editor` / `listener` / `public`), `can_edit`, `saved`, `member_count`, `save_count`; songs in playlists carry `added_by_username`.
- `PUT /api/playlists/:id` `{ name?, description?, visibility? }`, `GET /api/playlists/discover?q=`, `PUT|DELETE /api/playlists/:id/save`.
- `GET|POST /api/playlists/:id/members` `{ username, canEdit }`, `PUT|DELETE /api/playlists/:id/members/:userId` (`me` to leave).
- `DELETE /api/playlists/:id` deletes for the owner and removes the playlist from the library for everyone else.
- `POST /api/shares` `{ username, type, id, message? }`, `GET /api/shares/inbox`, `GET /api/shares/unread`, `POST /api/shares/:id|all/read`, `DELETE /api/shares/:id`; WebSocket event `share_received`.
- `GET /api/users/suggest?q=`, `GET|PUT /api/me/privacy`, `POST /api/me/blocks` `{ username }`, `DELETE /api/me/blocks/:userId`, `DELETE /api/me/history`.
- `/api/home` and `/api/library/overview` gain `inboxUnread`.
- Songs carry `intro_silence_ms`, `outro_silence_ms`, `loudness_lufs`, `peak_db` and `loudness_gain_db` once analysed.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
- **Android:** install the new `cumu_0.7.0-alpha.apk` from this release for the sleep timer, audiobooks, crossfade, gestures, the new queue, shared playlists, sharing and privacy. Older app versions keep working, but they show no audiobook sections.

After updating, reload the web app once (the offline cache is refreshed automatically).
