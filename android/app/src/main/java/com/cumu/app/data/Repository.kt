package com.cumu.app.data

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.URLEncoder

/** Everything the start page shows. */
data class HomeFeed(
    val home: HomeData,
    val albums: List<Album>,
    val playlists: List<Playlist>,
    val genres: GenreStats,
    val artists: List<Artist>,
)

/**
 * Library endpoints of the cumu server.
 *
 * Offline, answers come from the cache in [ApiClient]. For pages never
 * opened before, they are rebuilt from other saved lists (all songs,
 * albums, playlists) or from the downloaded songs, so nothing shows an error.
 */
class Repository(private val api: ApiClient, private val downloadedSongs: () -> List<Song>) {

    suspend fun home(): HomeData = try {
        api.get("/api/home")
    } catch (e: OfflineException) {
        val songs = downloadedSongs()
        HomeData(recentlyPlayed = songs.take(10), newSongs = songs.drop(10).take(10))
    }

    /**
     * The start page. Servers newer than v0.5.1 send it in a single small answer;
     * older ones need the full album, artist and playlist lists.
     */
    suspend fun homeFeed(): HomeFeed {
        val h = home()
        feedOf(h)?.let { return it }
        return coroutineScope {
            // Extras are optional: an older server or an error only hides their section
            val albums = async { runCatching { albums() }.getOrDefault(emptyList()) }
            val playlists = async { runCatching { playlists() }.getOrDefault(emptyList()) }
            val genres = async { runCatching { genreStats() }.getOrDefault(GenreStats()) }
            val artists = async {
                runCatching { artists() }.getOrDefault(emptyList()).filter { (it.songCount ?: 0) > 0 }
                    .sortedWith(compareBy({ it.image == null }, { -(it.songCount ?: 0) })).take(12)
            }
            HomeFeed(h, albums.await(), playlists.await().filter { it.readOnly && it.size > 0 }, genres.await(), artists.await())
        }
    }

    /** The start page as saved on the last visit, shown at once while the new one loads. */
    suspend fun cachedHomeFeed(): HomeFeed? = api.cached<HomeData>("/api/home")?.let { feedOf(it) }

    private fun feedOf(h: HomeData): HomeFeed? {
        val albums = h.newAlbums ?: return null
        return HomeFeed(h, albums, h.cumuPlaylists.orEmpty(), h.genres ?: GenreStats(), h.artists.orEmpty())
    }

    /**
     * Library tab: all playlists, but only the albums heard in the last
     * 3 months. Falls back to the full lists on servers up to v0.5.1.
     */
    suspend fun libraryOverview(): LibraryOverview {
        val o = try {
            api.get<LibraryOverview>("/api/library/overview")
        } catch (e: OfflineException) {
            return legacyOverview()
        } catch (e: ApiException) {
            if (e.status != 404) throw e
            return legacyOverview()
        } catch (e: kotlinx.serialization.SerializationException) {
            // Older server: unknown paths answer with the web page
            return legacyOverview()
        } catch (e: IllegalArgumentException) {
            return legacyOverview()
        }
        _favorites.value = o.favorites.toSet()
        return o
    }

    suspend fun cachedLibraryOverview(): LibraryOverview? =
        api.cached<LibraryOverview>("/api/library/overview")?.also {
            if (_favorites.value.isEmpty()) _favorites.value = it.favorites.toSet()
        }

    private suspend fun legacyOverview(): LibraryOverview = coroutineScope {
        val p = async { playlists() }
        val a = async { albums() }
        val ar = async { artists() }
        LibraryOverview(
            playlists = p.await(),
            albums = a.await(),
            artists = ar.await().filter { (it.songCount ?: 0) > 0 }.sortedBy { it.name.lowercase() },
            favorites = _favorites.value.toList(),
        )
    }

    // ── Favourites (shared with the web app) ────────────────────────────────

    private val _favorites = MutableStateFlow<Set<String>>(emptySet())
    /** Ids of the favourite songs; filled by the library and favourites answers. */
    val favorites: StateFlow<Set<String>> = _favorites.asStateFlow()

    suspend fun favoriteSongs(): List<Song> {
        val f = try {
            api.get<Favorites>("/api/favorites")
        } catch (e: OfflineException) {
            val ids = _favorites.value
            return downloadedSongs().filter { it.id in ids }
        }
        _favorites.value = f.ids.toSet()
        return f.songs
    }

    suspend fun cachedFavoriteSongs(): List<Song>? = api.cached<Favorites>("/api/favorites")?.songs

    /** Adds or removes a favourite; the heart changes at once and reverts on error. */
    suspend fun setFavorite(songId: String, favorite: Boolean) {
        val before = _favorites.value
        _favorites.value = if (favorite) before + songId else before - songId
        try {
            val text = if (favorite) api.put("/api/favorites/$songId") else api.delete("/api/favorites/$songId")
            runCatching { api.json.decodeFromString<Favorites>(text) }.getOrNull()?.let { _favorites.value = it.ids.toSet() }
        } catch (e: Exception) {
            _favorites.value = before
            throw e
        }
    }

    suspend fun search(q: String): SearchResult = try {
        api.get("/api/search?q=${URLEncoder.encode(q, "UTF-8")}")
    } catch (e: OfflineException) {
        searchOffline(q)
    }

    /** Search in everything saved on the phone. */
    private suspend fun searchOffline(q: String): SearchResult {
        val needle = q.trim().lowercase()
        fun String?.hit() = this?.lowercase()?.contains(needle) == true
        val songs = savedSongs()
        return SearchResult(
            songs = songs.filter { it.title.hit() || it.artistName.hit() || it.albumTitle.hit() }.take(20),
            albums = runCatching { albums() }.getOrDefault(emptyList()).filter { it.title.hit() || it.artistName.hit() }.take(10),
            artists = runCatching { artists() }.getOrDefault(emptyList()).filter { it.name.hit() }.take(10),
            playlists = runCatching { playlists() }.getOrDefault(emptyList()).filter { it.name.hit() }.take(10),
        )
    }

    /** Every song known on the phone: full list, home, playlists and downloads. */
    private suspend fun savedSongs(): List<Song> {
        val all = LinkedHashMap<String, Song>()
        runCatching { songs() }.getOrNull()?.forEach { all[it.id] = it }
        runCatching { home() }.getOrNull()?.let { h -> (h.recentlyPlayed + h.newSongs + h.mostPlayed).forEach { all.putIfAbsent(it.id, it) } }
        runCatching { playlists() }.getOrNull()?.forEach { p -> p.songs.forEach { all.putIfAbsent(it.id, it) } }
        downloadedSongs().forEach { all.putIfAbsent(it.id, it) }
        return all.values.toList()
    }

    /**
     * Loads the whole library once in the background while online, so search
     * and every list also work offline later.
     */
    suspend fun prefetch() {
        runCatching { favoriteSongs() }
        // The server answers one request after the other: let the screen that
        // is open load first instead of queueing it behind the whole library
        delay(8_000)
        for (path in listOf("/api/playlists", "/api/albums", "/api/artists", "/api/songs")) {
            // The big lists change rarely; refresh them at most every 6 hours
            if ((api.cacheAge(path) ?: Long.MAX_VALUE) < 6 * 3600_000L) continue
            runCatching { api.getText(path) }
        }
    }

    suspend fun songs(): List<Song> = try {
        api.get("/api/songs")
    } catch (e: OfflineException) {
        downloadedSongs()
    }

    suspend fun genreStats(): GenreStats = api.get("/api/genres/stats")
    suspend fun genre(name: String): GenreDetail = try {
        api.get("/api/genres/detail/${URLEncoder.encode(name, "UTF-8").replace("+", "%20")}")
    } catch (e: OfflineException) {
        GenreDetail(name, savedSongs().filter { it.genre.equals(name, ignoreCase = true) })
    }

    suspend fun albums(): List<Album> = try {
        api.get("/api/albums")
    } catch (e: OfflineException) {
        // Albums of the downloaded songs
        downloadedSongs().filter { it.albumId != null }.groupBy { it.albumId!! }.map { (id, s) ->
            Album(id = id, title = s.first().albumTitle ?: "Album", artistName = s.first().artistName, cover = s.firstNotNullOfOrNull { it.cover }, songCount = s.size)
        }
    }

    suspend fun album(id: String): Album = try {
        api.get("/api/albums/$id")
    } catch (e: OfflineException) {
        val songs = savedSongs().filter { it.albumId == id }.sortedBy { it.trackNumber ?: 0 }
        val info = runCatching { albums() }.getOrNull()?.firstOrNull { it.id == id }
        (info ?: Album(id = id, title = songs.firstOrNull()?.albumTitle ?: "Album", artistName = songs.firstOrNull()?.artistName, cover = songs.firstNotNullOfOrNull { it.cover }))
            .copy(songs = songs)
    }

    suspend fun artists(): List<Artist> = try {
        api.get("/api/artists")
    } catch (e: OfflineException) {
        downloadedSongs().filter { it.artistId != null }.groupBy { it.artistId!! }.map { (id, s) ->
            Artist(id = id, name = s.first().artistName ?: "Künstler", songCount = s.size)
        }
    }

    suspend fun artist(id: String): Artist = try {
        api.get("/api/artists/$id")
    } catch (e: OfflineException) {
        val songs = savedSongs().filter { it.artistId == id }
        val info = runCatching { artists() }.getOrNull()?.firstOrNull { it.id == id }
        val albums = runCatching { albums() }.getOrDefault(emptyList()).filter { it.artistId == id }
        (info ?: Artist(id = id, name = songs.firstOrNull()?.artistName ?: "Künstler")).copy(songs = songs, albums = albums)
    }

    suspend fun playlists(): List<Playlist> = try {
        api.get("/api/playlists")
    } catch (e: OfflineException) {
        emptyList()
    }

    suspend fun playlist(id: String): Playlist = try {
        api.get("/api/playlists/$id")
    } catch (e: OfflineException) {
        // The playlist list contains the songs of every playlist
        playlists().firstOrNull { it.id == id } ?: throw e
    }

    suspend fun createPlaylist(name: String): String {
        val text = api.post("/api/playlists", buildJsonObject { put("name", name) })
        val o = api.json.parseToJsonElement(text) as JsonObject
        return o["id"]!!.jsonPrimitive.contentOrNull!!
    }

    suspend fun addToPlaylist(playlistId: String, songId: String) {
        api.post("/api/playlists/$playlistId/songs", buildJsonObject { put("songId", songId) })
    }

    suspend fun removeFromPlaylist(playlistId: String, songId: String) {
        api.delete("/api/playlists/$playlistId/songs/$songId")
    }

    suspend fun reorderPlaylist(playlistId: String, songIds: List<String>) {
        api.post("/api/playlists/$playlistId/sync-songs", buildJsonObject {
            put("songIds", buildJsonArray { songIds.forEach { add(it) } })
        })
    }

    suspend fun deletePlaylist(id: String) {
        api.delete("/api/playlists/$id")
    }

    suspend fun addToLibrary(songId: String) {
        api.post("/api/library/song", buildJsonObject { put("songId", songId) })
    }

    /** Counts a play (history, "most played"); fire and forget. */
    suspend fun reportPlay(songId: String) {
        runCatching { api.post("/api/songs/$songId/play") }
    }
}
