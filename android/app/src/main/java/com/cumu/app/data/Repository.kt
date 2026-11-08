package com.cumu.app.data

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.net.URLEncoder

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
        for (path in listOf("/api/songs", "/api/albums", "/api/artists", "/api/playlists", "/api/home")) {
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
