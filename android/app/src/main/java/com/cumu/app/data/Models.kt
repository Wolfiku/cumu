package com.cumu.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Shapes of the cumu server's JSON (src/routes/api.js). Unknown fields are
// ignored, and almost everything is nullable because SQLite rows can be sparse.

@Serializable
data class Song(
    val id: String,
    val title: String = "",
    @SerialName("artist_id") val artistId: String? = null,
    @SerialName("album_id") val albumId: String? = null,
    @SerialName("artist_name") val artistName: String? = null,
    @SerialName("album_title") val albumTitle: String? = null,
    val cover: String? = null,
    val filename: String? = null,
    val duration: Double? = null,
    @SerialName("track_number") val trackNumber: Int? = null,
    val genre: String? = null,
    val year: Int? = null,
    @SerialName("file_size") val fileSize: Long? = null,
    @SerialName("play_count") val playCount: Int? = null,
)

@Serializable
data class Album(
    val id: String,
    val title: String = "",
    @SerialName("artist_id") val artistId: String? = null,
    @SerialName("artist_name") val artistName: String? = null,
    val cover: String? = null,
    val year: Int? = null,
    val genre: String? = null,
    @SerialName("song_count") val songCount: Int? = null,
    val songs: List<Song> = emptyList(),
)

@Serializable
data class Artist(
    val id: String,
    val name: String = "",
    val image: String? = null,
    @SerialName("song_count") val songCount: Int? = null,
    @SerialName("album_count") val albumCount: Int? = null,
    val albums: List<Album> = emptyList(),
    val songs: List<Song> = emptyList(),
)

@Serializable
data class Playlist(
    val id: String,
    val name: String = "",
    val description: String? = null,
    val cover: String? = null,
    @SerialName("is_generated") val isGenerated: Int = 0,
    val songs: List<Song> = emptyList(),
) {
    /** Playlists cumu generates itself cannot be edited. */
    val readOnly: Boolean get() = isGenerated == 1
}

@Serializable
data class HomeData(
    val recentlyPlayed: List<Song> = emptyList(),
    val mostPlayed: List<Song> = emptyList(),
    val newSongs: List<Song> = emptyList(),
)

@Serializable
data class SearchResult(
    val songs: List<Song> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long = 3600,
)

@Serializable
data class AuthorizeResponse(
    val code: String,
    @SerialName("admin_trust") val adminTrust: String? = null,
)

@Serializable
data class Me(
    val username: String = "",
    val role: String = "user",
)

@Serializable
data class GenreCount(
    val genre: String,
    val count: Int = 0,
    val topArtist: String? = null,
)

@Serializable
data class GenreStats(
    val topGenres: List<GenreCount> = emptyList(),
    val mostPlayedGenre: String? = null,
)

@Serializable
data class GenreDetail(
    val genre: String = "",
    val songs: List<Song> = emptyList(),
)
