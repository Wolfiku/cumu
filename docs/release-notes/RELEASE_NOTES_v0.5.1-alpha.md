# cumu v0.5.1-alpha — Smarter Search & Discover Refresh

> ⚠️ **This is an alpha release.** cumu is still under active development. Expect bugs, back up your `data` folder before updating, and please report problems in the [issues](https://github.com/Wolfiku/cumu/issues).

---

## 🔎 Smarter, Typo-Tolerant Search

- **Typos no longer matter.** "the weekend" finds *The Weeknd*, "metalica" finds *Metallica*, "blindng lights" finds *Blinding Lights*. Accents, punctuation and a missing "The" are ignored too ("beyonce" → *Beyoncé*, "acdc" → *AC/DC*).
- **Ranked results with a top result.** Exact matches beat prefixes, prefixes beat partial and fuzzy matches. The best match is shown big at the top. For an artist, their most popular songs appear right next to it.
- **No more song floods.** Searching for an artist shows the artist first, not 20 of their songs. The song list stays short with a *Show all* button.
- Search across several fields works too, e.g. "blinding lights weeknd" or "rammstein sonne".

## 🎧 Most Played Albums

- New **Most Played Albums** section on the Discover page: the albums you listened to most in the last 3 months.
- With too little listening history yet, it shows **Recently Added Albums** instead.

## 🎨 Visual Fixes

- **Every genre has its own colour.** Genre tiles and genre pages were all grey before. Now each of the 100 genres has a distinct colour, and custom genres get a stable colour derived from their name.
- **Podcasts in the search fixed.** Podcast results were broken and squeezed into one tiny row. They now show as normal-sized cards side by side.
- **Long names stay inside their tiles.** Titles, artist and album names end with "…" instead of overflowing. On phones they get up to two lines first.

## ⬆️ Updating

- **Docker / NAS:** Watchtower updates automatically, or use "Update installieren" in the admin panel.
- **Linux / LXC / .deb:** `sudo cumu-update`
- **Android:** no app update needed. The app works with this server as before.

After updating, reload the web app once (the offline cache is refreshed automatically).
